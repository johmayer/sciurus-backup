use sqlx::SqlitePool;
use tokio::process::Command;
use crate::models::{Plan, Remote, Source};
use crate::encryption::{decrypt_secret, encrypt_secret, is_encrypted};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;
use serde_json::Value;

async fn obscure_password(password: &str) -> String {
    match Command::new("rclone")
        .arg("obscure")
        .arg(password)
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => password.to_string(), // fallback
    }
}

pub fn truncate_log(log: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = log.lines().collect();
    if lines.len() > max_lines {
        lines[lines.len() - max_lines..].join("\n")
    } else {
        log.to_string()
    }
}

struct PreparedConfig {
    conf_path: String,
    destination: String,
}

async fn prepare_config_file(plan: &Plan, remote: &Remote, override_password: Option<&str>) -> Result<PreparedConfig, String> {
    let remote_config: serde_json::Value = serde_json::from_str(&remote.config).map_err(|e| e.to_string())?;
    let base_remote_name = format!("remote_{}", remote.id);
    let mut content = format!("[{}]\n", base_remote_name);
    content.push_str(&format!("type = {}\n", remote.type_));

    if let Value::Object(map) = remote_config {
        for (key, value) in map {
            let val_str = match value {
                Value::String(s) => s,
                other => other.to_string(),
            };
            
            let final_value = if is_encrypted(&val_str) {
                decrypt_secret(&val_str).unwrap_or(val_str)
            } else {
                val_str
            };
            content.push_str(&format!("{} = {}\n", key, final_value));
        }
    }

    let prefix = if plan.backup_prefix.is_empty() { "backup" } else { &plan.backup_prefix };
    let clean_folder = plan.remote_folder_path.trim_matches('/');
    let folder_path = if clean_folder.is_empty() { String::new() } else { format!("{}/", clean_folder) };
    let destination = format!("{}:/{}{}_{}", base_remote_name, folder_path, prefix, plan.id);
    let mut final_destination = destination.clone();

    let active_password = override_password.map(|s| s.to_string()).or(plan.password.clone());

    if plan.encrypt {
        if let Some(mut raw_pass) = active_password {
            let crypt_remote_name = format!("crypt_{}", plan.id);
            content.push_str(&format!("\n[{}]\n", crypt_remote_name));
            content.push_str("type = crypt\n");
            content.push_str(&format!("remote = {}\n", destination));

            if is_encrypted(&raw_pass) {
                raw_pass = decrypt_secret(&raw_pass).unwrap_or(raw_pass);
            }
            let obscured = obscure_password(&raw_pass).await;
            content.push_str(&format!("password = {}\n", obscured));
            final_destination = format!("{}:/", crypt_remote_name);
        }
    }

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let conf_path = format!("/tmp/rclone-plan-{}-{}.conf", plan.id, timestamp);
    
    fs::write(&conf_path, content).await.map_err(|e| e.to_string())?;

    Ok(PreparedConfig { conf_path, destination: final_destination })
}

async fn extract_and_update_remote_config(pool: &SqlitePool, conf_path: &str, remote: &Remote) -> Result<(), String> {
    let content = fs::read_to_string(conf_path).await.map_err(|e| e.to_string())?;
    let base_remote_name = format!("remote_{}", remote.id);
    let mut in_remote = false;
    let mut new_config = std::collections::HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_remote = trimmed == format!("[{}]", base_remote_name);
            continue;
        }
        if in_remote && trimmed.contains('=') {
            if let Some((key, val)) = trimmed.split_once('=') {
                let k = key.trim();
                let v = val.trim();
                if k != "type" {
                    new_config.insert(k.to_string(), v.to_string());
                }
            }
        }
    }

    let mut old_config: Value = serde_json::from_str(&remote.config).unwrap_or(Value::Null);
    let mut changed = false;

    if let Value::Object(ref mut map) = old_config {
        for (k, new_v) in new_config {
            let old_val_raw = map.get(&k).cloned();
            let mut old_val_plain = old_val_raw.clone().map(|v| match v {
                Value::String(s) => s,
                other => other.to_string(),
            });

            if let Some(plain) = old_val_plain.as_mut() {
                if is_encrypted(plain) {
                    *plain = decrypt_secret(plain).unwrap_or(plain.to_string());
                }
            }

            if old_val_plain.as_deref() != Some(&new_v) {
                changed = true;
                
                let is_enc = match old_val_raw {
                    Some(Value::String(ref s)) => is_encrypted(s),
                    _ => false,
                };

                let updated_val = if is_enc {
                    Value::String(encrypt_secret(&new_v).unwrap_or(new_v.clone()))
                } else if let Ok(parsed) = serde_json::from_str::<Value>(&new_v) {
                    parsed
                } else {
                    Value::String(new_v)
                };

                map.insert(k, updated_val);
            }
        }
    }

    if changed {
        let new_json = serde_json::to_string(&old_config).unwrap();
        sqlx::query("UPDATE Remote SET config = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(new_json)
            .bind(&remote.id)
            .execute(pool).await.map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub async fn execute_rclone_backup(pool: &SqlitePool, plan_id: &str) -> Result<String, String> {
    let plan: Plan = sqlx::query_as("SELECT * FROM Plan WHERE id = ?").bind(plan_id).fetch_one(pool).await.map_err(|_| "Plan not found".to_string())?;
    
    if plan.status == "Running" || plan.status == "Restoring" {
        return Err(format!("Plan {} is already active. Skipping execution.", plan.name));
    }

    let source: Source = sqlx::query_as("SELECT * FROM Source WHERE id = ?").bind(&plan.source_id).fetch_one(pool).await.map_err(|_| "Source not found".to_string())?;
    let remote: Remote = sqlx::query_as("SELECT * FROM Remote WHERE id = ?").bind(&plan.remote_id).fetch_one(pool).await.map_err(|_| "Remote not found".to_string())?;

    sqlx::query("UPDATE Plan SET status = 'Running' WHERE id = ?").bind(plan_id).execute(pool).await.map_err(|e| e.to_string())?;

    let prepared = match prepare_config_file(&plan, &remote, None).await {
        Ok(p) => p,
        Err(e) => {
            let _ = sqlx::query("UPDATE Plan SET status = 'Error' WHERE id = ?").bind(plan_id).execute(pool).await;
            return Err(e);
        }
    };

    let backup_log_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO BackupLog (id, planId, status, message) VALUES (?, ?, 'Running', 'Starting backup...')")
        .bind(&backup_log_id).bind(plan_id).execute(pool).await.map_err(|e| e.to_string())?;

    let mut child = Command::new("rclone")
        .args(&["sync", &source.path, &prepared.destination, "--config", &prepared.conf_path, "--verbose", "--stats=1s", "--stats-one-line"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let _ = std::fs::remove_file(&prepared.conf_path);
            format!("Failed to spawn rclone: {}", e)
        })?;

    let stderr = child.stderr.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    
    use tokio::io::{BufReader, AsyncBufReadExt};
    let mut stderr_reader = BufReader::new(stderr).lines();
    let mut stdout_reader = BufReader::new(stdout).lines();
    
    let mut full_log = String::new();
    let mut last_update = tokio::time::Instant::now();

    loop {
        tokio::select! {
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(l)) => {
                        full_log.push_str(&l);
                        full_log.push('\n');
                        
                        let now = tokio::time::Instant::now();
                        if now.duration_since(last_update).as_millis() > 1000 {
                            if l.contains("ETA") || l.contains("/s,") {
                                last_update = now;
                                let _ = sqlx::query("UPDATE BackupLog SET message = ? WHERE id = ?")
                                    .bind(l).bind(&backup_log_id).execute(pool).await;
                                if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
                            }
                        }
                    }
                    _ => break,
                }
            }
        }
    }
    
    // Drain remaining stdout if any
    while let Ok(Some(l)) = stdout_reader.next_line().await {
        full_log.push_str(&l);
        full_log.push('\n');
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = extract_and_update_remote_config(pool, &prepared.conf_path, &remote).await;
    let plan_status = if status.success() { "Active" } else { "Error" };
    let _ = sqlx::query("UPDATE Plan SET status = ? WHERE id = ?").bind(plan_status).bind(plan_id).execute(pool).await;

    if status.success() {
        let size_output = Command::new("rclone")
            .args(&["size", &prepared.destination, "--config", &prepared.conf_path, "--json"])
            .output()
            .await;
            
        let mut final_bytes = None;
        let mut final_files = None;
        
        if let Ok(out) = size_output {
            if let Ok(json) = serde_json::from_slice::<Value>(&out.stdout) {
                final_bytes = json.get("bytes").and_then(|v| v.as_i64());
                final_files = json.get("count").and_then(|v| v.as_i64());
            }
        }

        if final_bytes.is_some() {
            let _ = sqlx::query("UPDATE Plan SET lastBackupSize = ?, lastBackupFiles = ? WHERE id = ?")
                .bind(final_bytes).bind(final_files).bind(plan_id).execute(pool).await;
        }

        if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
        let _ = sqlx::query("UPDATE BackupLog SET status = 'Success', message = 'Backup completed successfully', rawOutput = NULL, completedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&backup_log_id).execute(pool).await;
            
        let _ = std::fs::remove_file(&prepared.conf_path);
        Ok(full_log)
    } else {
        let truncated = truncate_log(&full_log, 50);
        if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
        let _ = sqlx::query("UPDATE BackupLog SET status = 'Failed', message = 'Backup failed', rawOutput = ?, completedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(truncated).bind(&backup_log_id).execute(pool).await;
            
        Err(format!("Backup failed with code {:?}", status.code()))
    }
}

pub async fn execute_rclone_restore(pool: &SqlitePool, plan_id: &str, override_password: Option<&str>) -> Result<String, String> {
    let plan: Plan = sqlx::query_as("SELECT * FROM Plan WHERE id = ?").bind(plan_id).fetch_one(pool).await.map_err(|_| "Plan not found".to_string())?;
    
    if plan.status == "Running" || plan.status == "Restoring" {
        return Err(format!("Plan {} is already active. Skipping execution.", plan.name));
    }

    let source: Source = sqlx::query_as("SELECT * FROM Source WHERE id = ?").bind(&plan.source_id).fetch_one(pool).await.map_err(|_| "Source not found".to_string())?;
    let remote: Remote = sqlx::query_as("SELECT * FROM Remote WHERE id = ?").bind(&plan.remote_id).fetch_one(pool).await.map_err(|_| "Remote not found".to_string())?;

    sqlx::query("UPDATE Plan SET status = 'Restoring' WHERE id = ?").bind(plan_id).execute(pool).await.map_err(|e| e.to_string())?;

    let prepared = match prepare_config_file(&plan, &remote, override_password).await {
        Ok(p) => p,
        Err(e) => {
            let _ = sqlx::query("UPDATE Plan SET status = 'Error' WHERE id = ?").bind(plan_id).execute(pool).await;
            return Err(e);
        }
    };

    let active_password = override_password.map(|s| s.to_string()).or(plan.password.clone());

    if plan.encrypt && active_password.is_some() {
        let base_remote_name = format!("remote_{}", plan.remote_id);
        let prefix = if plan.backup_prefix.is_empty() { "backup" } else { &plan.backup_prefix };
        let clean_folder = plan.remote_folder_path.trim_matches('/');
        let folder_path = if clean_folder.is_empty() { String::new() } else { format!("{}/", clean_folder) };
        let base_remote_path = format!("{}:/{}{}_{}", base_remote_name, folder_path, prefix, plan.id);

        let base_size_output = Command::new("rclone")
            .args(&["size", &base_remote_path, "--config", &prepared.conf_path, "--json"])
            .output().await;

        if let Ok(out) = base_size_output {
            if let Ok(json) = serde_json::from_slice::<Value>(&out.stdout) {
                if json.get("count").and_then(|v| v.as_i64()).unwrap_or(0) > 0 {
                    let crypt_size_output = Command::new("rclone")
                        .args(&["size", &prepared.destination, "--config", &prepared.conf_path, "--json"])
                        .output().await;

                    if let Ok(c_out) = crypt_size_output {
                        if let Ok(c_json) = serde_json::from_slice::<Value>(&c_out.stdout) {
                            if c_json.get("count").and_then(|v| v.as_i64()).unwrap_or(0) == 0 {
                                let _ = sqlx::query("UPDATE Plan SET status = 'Error' WHERE id = ?").bind(plan_id).execute(pool).await;
                                let _ = std::fs::remove_file(&prepared.conf_path);
                                return Err("Password mismatch! Remote is not empty but crypt sees 0 files (MAC authentication failed). Aborting restore to prevent data loss.".to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let backup_log_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO BackupLog (id, planId, status, message) VALUES (?, ?, 'Restoring', 'Starting restore...')")
        .bind(&backup_log_id).bind(plan_id).execute(pool).await.map_err(|e| e.to_string())?;

    let mut child = Command::new("rclone")
        .args(&["sync", &prepared.destination, &source.path, "--config", &prepared.conf_path, "--verbose", "--stats=1s", "--stats-one-line"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let _ = std::fs::remove_file(&prepared.conf_path);
            format!("Failed to spawn rclone: {}", e)
        })?;

    let stderr = child.stderr.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    
    use tokio::io::{BufReader, AsyncBufReadExt};
    let mut stderr_reader = BufReader::new(stderr).lines();
    let mut stdout_reader = BufReader::new(stdout).lines();
    
    let mut full_log = String::new();
    let mut last_update = tokio::time::Instant::now();

    loop {
        tokio::select! {
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(l)) => {
                        full_log.push_str(&l);
                        full_log.push('\n');
                        
                        let now = tokio::time::Instant::now();
                        if now.duration_since(last_update).as_millis() > 1000 {
                            if l.contains("ETA") || l.contains("/s,") {
                                last_update = now;
                                let _ = sqlx::query("UPDATE BackupLog SET message = ? WHERE id = ?")
                                    .bind(l).bind(&backup_log_id).execute(pool).await;
                                if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
                            }
                        }
                    }
                    _ => break,
                }
            }
        }
    }
    
    while let Ok(Some(l)) = stdout_reader.next_line().await {
        full_log.push_str(&l);
        full_log.push('\n');
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = extract_and_update_remote_config(pool, &prepared.conf_path, &remote).await;
    let plan_status = if status.success() { "Active" } else { "Error" };
    let _ = sqlx::query("UPDATE Plan SET status = ? WHERE id = ?").bind(plan_status).bind(plan_id).execute(pool).await;

    if status.success() {
        let size_output = Command::new("rclone")
            .args(&["size", &prepared.destination, "--config", &prepared.conf_path, "--json"])
            .output()
            .await;
            
        let mut final_bytes = None;
        let mut final_files = None;
        
        if let Ok(out) = size_output {
            if let Ok(json) = serde_json::from_slice::<Value>(&out.stdout) {
                final_bytes = json.get("bytes").and_then(|v| v.as_i64());
                final_files = json.get("count").and_then(|v| v.as_i64());
            }
        }

        if final_bytes.is_some() {
            let _ = sqlx::query("UPDATE Plan SET lastBackupSize = ?, lastBackupFiles = ? WHERE id = ?")
                .bind(final_bytes).bind(final_files).bind(plan_id).execute(pool).await;
        }

        if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
        let _ = sqlx::query("UPDATE BackupLog SET status = 'Success', message = 'Restore completed successfully', rawOutput = NULL, completedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&backup_log_id).execute(pool).await;
            
        let _ = std::fs::remove_file(&prepared.conf_path);
        let _ = std::fs::remove_file(&prepared.conf_path);
        Ok(full_log)
    } else {
        let mut truncated = truncate_log(&full_log, 50);
        truncated.push_str("\n[Restore Action]");
        if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
        let _ = sqlx::query("UPDATE BackupLog SET status = 'Failed', message = 'Restore failed', rawOutput = ?, completedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(truncated).bind(&backup_log_id).execute(pool).await;
            
        Err(format!("Restore failed with code {:?}", status.code()))
    }
}

pub async fn check_plan_remote_data(pool: &SqlitePool, plan_id: &str) -> Result<bool, String> {
    let plan: Plan = sqlx::query_as("SELECT * FROM Plan WHERE id = ?").bind(plan_id).fetch_one(pool).await.map_err(|_| "Plan not found".to_string())?;
    let remote: Remote = sqlx::query_as("SELECT * FROM Remote WHERE id = ?").bind(&plan.remote_id).fetch_one(pool).await.map_err(|_| "Remote not found".to_string())?;

    let prepared = prepare_config_file(&plan, &remote, None).await?;
    
    let output = Command::new("rclone")
        .args(&["size", &prepared.destination, "--config", &prepared.conf_path, "--json"])
        .output()
        .await;
        
    let _ = std::fs::remove_file(&prepared.conf_path);

    match output {
        Ok(out) => {
            if let Ok(json) = serde_json::from_slice::<Value>(&out.stdout) {
                if let Some(count) = json.get("count").and_then(|v| v.as_i64()) {
                    return Ok(count > 0);
                }
            }
            let err_str = String::from_utf8_lossy(&out.stderr);
            if err_str.contains("directory not found") || err_str.contains("error reading source directory") {
                return Ok(false);
            }
            Err("Failed to parse size output".to_string())
        }
        Err(_) => Err("Failed to execute rclone size".to_string())
    }
}

pub async fn purge_plan_remote_data(pool: &SqlitePool, plan_id: &str) -> Result<(), String> {
    let plan: Plan = sqlx::query_as("SELECT * FROM Plan WHERE id = ?").bind(plan_id).fetch_one(pool).await.map_err(|_| "Plan not found".to_string())?;
    let remote: Remote = sqlx::query_as("SELECT * FROM Remote WHERE id = ?").bind(&plan.remote_id).fetch_one(pool).await.map_err(|_| "Remote not found".to_string())?;

    let prepared = prepare_config_file(&plan, &remote, None).await?;
    
    let base_remote_name = format!("remote_{}", plan.remote_id);
    let prefix = if plan.backup_prefix.is_empty() { "backup" } else { &plan.backup_prefix };
    let clean_folder = plan.remote_folder_path.trim_matches('/');
    let folder_path = if clean_folder.is_empty() { String::new() } else { format!("{}/", clean_folder) };
    let underlying_destination = format!("{}:/{}{}_{}", base_remote_name, folder_path, prefix, plan.id);

    let output = Command::new("rclone")
        .args(&["purge", &underlying_destination, "--config", &prepared.conf_path])
        .output()
        .await;
        
    let _ = std::fs::remove_file(&prepared.conf_path);

    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => Err(format!("Purge failed: {}", String::from_utf8_lossy(&out.stderr))),
        Err(e) => Err(format!("Failed to execute rclone purge: {}", e))
    }
}
