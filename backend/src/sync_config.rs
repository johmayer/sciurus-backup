use sqlx::SqlitePool;
use serde_yaml::Value;
use std::fs;
use crate::encryption::{encrypt_secret, is_encrypted};

pub async fn sync_to_db(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    let config_path_env = std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config.yaml".to_string());
    
    // Resolve relative to the /rust directory instead of /rust/backend
    let config_path = if std::path::Path::new(&config_path_env).is_absolute() {
        std::path::PathBuf::from(config_path_env)
    } else {
        let mut dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        if dir.ends_with("backend") {
            dir.pop();
        }
        dir.join(&config_path_env)
    };
    let config_path_str = config_path.to_string_lossy().to_string();
    
    if !config_path.exists() {
        println!("[Sync] No config.yaml found at {}, skipping declarative sync.", config_path_str);
        return Ok(());
    }

    println!("[Sync] Reading config from {}...", config_path_str);
    let file_contents = fs::read_to_string(&config_path)?;
    
    let mut doc: Value = serde_yaml::from_str(&file_contents).unwrap_or(Value::Mapping(serde_yaml::Mapping::new()));
    
    let mut needs_rewrite = false;

    if let Value::Mapping(ref mut map) = doc {
        if map.contains_key(&Value::String("auth".to_string())) {
            println!("[Sync] Cleaning plaintext auth from config.yaml...");
            map.remove(&Value::String("auth".to_string()));
            needs_rewrite = true;
        }

        // Remotes
        if let Some(Value::Sequence(remotes)) = map.get_mut(&Value::String("remotes".to_string())) {
            println!("[Sync] Found {} remotes. Syncing...", remotes.len());
            for remote in remotes.iter_mut() {
                if let Value::Mapping(r) = remote {
                    let name = r.get(&Value::String("name".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let id = r.get(&Value::String("id".to_string())).and_then(|v| v.as_str()).unwrap_or_else(|| &name).to_string();
                    let r_type = r.get(&Value::String("type".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    
                    if let Some(Value::Mapping(config)) = r.get_mut(&Value::String("config".to_string())) {
                        for key in ["pass", "password", "token", "client_secret"] {
                            let k = Value::String(key.to_string());
                            if let Some(val) = config.get_mut(&k) {
                                if let Some(val_str) = val.as_str() {
                                    if !is_encrypted(val_str) {
                                        if let Ok(enc) = encrypt_secret(val_str) {
                                            *val = Value::String(enc);
                                            needs_rewrite = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    let config_json = r.get(&Value::String("config".to_string())).map(|c| serde_json::to_string(c).unwrap_or_else(|_| "{}".to_string())).unwrap_or_else(|| "{}".to_string());

                    sqlx::query("INSERT INTO Remote (id, name, type, config, createdAt, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                                ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, config=excluded.config, updatedAt=CURRENT_TIMESTAMP")
                        .bind(&id)
                        .bind(name)
                        .bind(r_type)
                        .bind(config_json)
                        .execute(pool)
                        .await?;
                }
            }
        }
        
        // Sources
        if let Some(Value::Sequence(sources)) = map.get_mut(&Value::String("sources".to_string())) {
            println!("[Sync] Found {} sources. Syncing...", sources.len());
            for source in sources.iter_mut() {
                if let Value::Mapping(s) = source {
                    let name = s.get(&Value::String("name".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let id = s.get(&Value::String("id".to_string())).and_then(|v| v.as_str()).unwrap_or_else(|| &name).to_string();
                    let path = s.get(&Value::String("path".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    
                    sqlx::query("INSERT INTO Source (id, name, path, createdAt, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                                ON CONFLICT(id) DO UPDATE SET name=excluded.name, path=excluded.path, updatedAt=CURRENT_TIMESTAMP")
                        .bind(&id)
                        .bind(name)
                        .bind(path)
                        .execute(pool)
                        .await?;
                }
            }
        }

        // Plans
        if let Some(Value::Sequence(plans)) = map.get_mut(&Value::String("plans".to_string())) {
            println!("[Sync] Found {} plans. Syncing...", plans.len());
            for plan in plans.iter_mut() {
                if let Value::Mapping(p) = plan {
                    let name = p.get(&Value::String("name".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let id = p.get(&Value::String("id".to_string())).and_then(|v| v.as_str()).unwrap_or_else(|| &name).to_string();
                    let schedule = p.get(&Value::String("schedule".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let mut source_id = p.get(&Value::String("sourceId".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let mut remote_id = p.get(&Value::String("remoteId".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    
                    if source_id.is_empty() {
                        if let Some(s_name) = p.get(&Value::String("sourceName".to_string())).and_then(|v| v.as_str()) {
                            if let Ok(Some((s_id,))) = sqlx::query_as::<_, (String,)>("SELECT id FROM Source WHERE name = ?").bind(s_name).fetch_optional(pool).await {
                                source_id = s_id;
                            }
                        }
                    }
                    
                    if remote_id.is_empty() {
                        if let Some(r_name) = p.get(&Value::String("remoteName".to_string())).and_then(|v| v.as_str()) {
                            if let Ok(Some((r_id,))) = sqlx::query_as::<_, (String,)>("SELECT id FROM Remote WHERE name = ?").bind(r_name).fetch_optional(pool).await {
                                remote_id = r_id;
                            }
                        }
                    }
                    
                    if let Some(val) = p.get_mut(&Value::String("password".to_string())) {
                        if let Some(val_str) = val.as_str() {
                            if !val_str.is_empty() && !is_encrypted(val_str) {
                                if let Ok(enc) = encrypt_secret(val_str) {
                                    *val = Value::String(enc);
                                    needs_rewrite = true;
                                }
                            }
                        }
                    }
                    
                    let password = p.get(&Value::String("password".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let encrypt = p.get(&Value::String("encrypt".to_string())).and_then(|v| v.as_bool()).unwrap_or(false);
                    let enabled = p.get(&Value::String("enabled".to_string())).and_then(|v| v.as_bool()).unwrap_or(true);
                    let remote_folder_path = p.get(&Value::String("remoteFolderPath".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let backup_prefix = p.get(&Value::String("backupPrefix".to_string())).and_then(|v| v.as_str()).unwrap_or("backup").to_string();
                    let status = p.get(&Value::String("status".to_string())).and_then(|v| v.as_str()).unwrap_or("Active").to_string();
                    
                    if !source_id.is_empty() && !remote_id.is_empty() {
                        sqlx::query("INSERT INTO Plan (id, name, schedule, encrypt, enabled, remoteFolderPath, backupPrefix, password, status, sourceId, remoteId, createdAt, updatedAt) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                                    ON CONFLICT(id) DO UPDATE SET name=excluded.name, schedule=excluded.schedule, encrypt=excluded.encrypt, enabled=excluded.enabled, remoteFolderPath=excluded.remoteFolderPath, backupPrefix=excluded.backupPrefix, password=excluded.password, status=excluded.status, sourceId=excluded.sourceId, remoteId=excluded.remoteId, updatedAt=CURRENT_TIMESTAMP")
                            .bind(&id)
                            .bind(name)
                            .bind(schedule)
                            .bind(encrypt)
                            .bind(enabled)
                            .bind(remote_folder_path)
                            .bind(backup_prefix)
                            .bind(password)
                            .bind(status)
                            .bind(&source_id)
                            .bind(&remote_id)
                            .execute(pool)
                            .await?;
                    }
                }
            }
        }
    }
    
    if needs_rewrite {
        println!("[Sync] Rewriting config.yaml to persist encrypted secrets.");
        let out = serde_yaml::to_string(&doc)?;
        fs::write(&config_path_str, out)?;
    }
    
    println!("[Sync] Finished syncing config.yaml");
    Ok(())
}


pub async fn write_to_disk(pool: &sqlx::SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    let config_path_env = std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config.yaml".to_string());
    
    let config_path = if std::path::Path::new(&config_path_env).is_absolute() {
        std::path::PathBuf::from(config_path_env)
    } else {
        let mut dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        if dir.ends_with("backend") {
            dir.pop();
        }
        dir.join(&config_path_env)
    };
    let config_path_str = config_path.to_string_lossy().to_string();
    
    let remotes = sqlx::query_as::<_, crate::models::Remote>("SELECT * FROM Remote")
        .fetch_all(pool)
        .await?;
        
    let sources = sqlx::query_as::<_, crate::models::Source>("SELECT * FROM Source")
        .fetch_all(pool)
        .await?;
        
    let plans = sqlx::query_as::<_, crate::models::Plan>("SELECT * FROM Plan")
        .fetch_all(pool)
        .await?;
        
    let mut doc = serde_yaml::Mapping::new();
    
    // Remotes
    let mut remotes_seq = Vec::new();
    for r in remotes {
        let mut map = serde_yaml::Mapping::new();
        map.insert(serde_yaml::Value::String("id".to_string()), serde_yaml::Value::String(r.id));
        map.insert(serde_yaml::Value::String("name".to_string()), serde_yaml::Value::String(r.name));
        map.insert(serde_yaml::Value::String("type".to_string()), serde_yaml::Value::String(r.type_));
        
        let config_val: serde_yaml::Value = serde_yaml::from_str(&r.config).unwrap_or_else(|_| serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        map.insert(serde_yaml::Value::String("config".to_string()), config_val);
        remotes_seq.push(serde_yaml::Value::Mapping(map));
    }
    doc.insert(serde_yaml::Value::String("remotes".to_string()), serde_yaml::Value::Sequence(remotes_seq));

    // Sources
    let mut sources_seq = Vec::new();
    for s in sources {
        let mut map = serde_yaml::Mapping::new();
        map.insert(serde_yaml::Value::String("id".to_string()), serde_yaml::Value::String(s.id));
        map.insert(serde_yaml::Value::String("name".to_string()), serde_yaml::Value::String(s.name));
        map.insert(serde_yaml::Value::String("path".to_string()), serde_yaml::Value::String(s.path));
        sources_seq.push(serde_yaml::Value::Mapping(map));
    }
    doc.insert(serde_yaml::Value::String("sources".to_string()), serde_yaml::Value::Sequence(sources_seq));

    // Plans
    let mut plans_seq = Vec::new();
    for p in plans {
        let mut map = serde_yaml::Mapping::new();
        map.insert(serde_yaml::Value::String("id".to_string()), serde_yaml::Value::String(p.id));
        map.insert(serde_yaml::Value::String("name".to_string()), serde_yaml::Value::String(p.name));
        map.insert(serde_yaml::Value::String("sourceId".to_string()), serde_yaml::Value::String(p.source_id));
        map.insert(serde_yaml::Value::String("remoteId".to_string()), serde_yaml::Value::String(p.remote_id));
        map.insert(serde_yaml::Value::String("schedule".to_string()), serde_yaml::Value::String(p.schedule));
        map.insert(serde_yaml::Value::String("encrypt".to_string()), serde_yaml::Value::Bool(p.encrypt));
        
        if let Some(pass) = p.password {
            if !pass.is_empty() {
                map.insert(serde_yaml::Value::String("password".to_string()), serde_yaml::Value::String(pass));
            }
        }
        
        map.insert(serde_yaml::Value::String("enabled".to_string()), serde_yaml::Value::Bool(p.enabled));
        map.insert(serde_yaml::Value::String("remoteFolderPath".to_string()), serde_yaml::Value::String(p.remote_folder_path));
        map.insert(serde_yaml::Value::String("backupPrefix".to_string()), serde_yaml::Value::String(p.backup_prefix));
        map.insert(serde_yaml::Value::String("status".to_string()), serde_yaml::Value::String(p.status));
        
        plans_seq.push(serde_yaml::Value::Mapping(map));
    }
    doc.insert(serde_yaml::Value::String("plans".to_string()), serde_yaml::Value::Sequence(plans_seq));

    let out = serde_yaml::to_string(&doc)?;
    std::fs::write(&config_path_str, out)?;
    
    Ok(())
}
