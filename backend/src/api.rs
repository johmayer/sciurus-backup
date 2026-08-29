
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{decode, DecodingKey, Validation};

async fn auth_middleware(req: Request<axum::body::Body>, next: Next) -> Result<Response, axum::http::StatusCode> {
    let path = req.uri().path();
    if path.starts_with("/auth/") {
        return Ok(next.run(req).await);
    }
    
    let auth_header = req.headers().get("Authorization");
    if let Some(header) = auth_header {
        if let Ok(token_str) = header.to_str() {
            if token_str.starts_with("Bearer ") {
                let token = &token_str[7..];
                let secret = std::env::var("AUTH_SECRET").unwrap_or_else(|_| "secret".to_string());
                if decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::default()).is_ok() {
                    return Ok(next.run(req).await);
                }
            }
        }
    }
    
    Err(axum::http::StatusCode::UNAUTHORIZED)
}
use tokio_stream::StreamExt;
use std::str::FromStr;
use axum::{
    routing::{get, post, delete},
    Router, Json, extract::{State, Path},
};
use sqlx::SqlitePool;
use crate::models::{Plan, Remote, Source, BackupLog};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/plans", get(list_plans).post(create_plan))
        .route("/plans/{id}", get(get_plan).put(update_plan).delete(delete_plan))
        .route("/plans/{id}/run", post(run_plan))
        .route("/plans/{id}/cancel", post(cancel_plan))
        .route("/plans/{id}/restore", post(restore_plan))
        .route("/plans/{id}/check_remote_data", get(check_plan_remote_data))
        .route("/plans/{id}/purge", post(purge_plan_remote_data))
        .route("/sources", get(list_sources).post(create_source))
        .route("/sources/ls", post(list_directories))
        .route("/sources/{id}", get(get_source).put(update_source).delete(delete_source))
        .route("/remotes", get(list_remotes).post(create_remote))
        .route("/remotes/{id}", get(get_remote).put(update_remote).delete(delete_remote))
        .route("/logs", get(list_logs).delete(delete_all_logs))
        .route("/events", axum::routing::get(sse_handler))
        .route("/logs/{id}", delete(delete_log))
        .route("/settings/export", post(export_config))
        .route("/auth/login", post(login))
        .route("/auth/status", get(auth_status))
        .route("/auth/setup", post(setup_admin))
        .route("/auth/oidc/login", get(oidc_login))
        .route("/auth/oidc/callback", get(oidc_callback))
        .layer(axum::middleware::from_fn(auth_middleware))
}

async fn list_plans(State(pool): State<SqlitePool>) -> Result<Json<Vec<serde_json::Value>>, String> {
    let plans = sqlx::query_as::<_, Plan>("SELECT * FROM Plan ORDER BY createdAt DESC")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let sources = sqlx::query_as::<_, Source>("SELECT * FROM Source").fetch_all(&pool).await.unwrap_or_default();
    let remotes = sqlx::query_as::<_, Remote>("SELECT * FROM Remote").fetch_all(&pool).await.unwrap_or_default();
    let logs = sqlx::query_as::<_, BackupLog>("SELECT * FROM BackupLog ORDER BY createdAt DESC").fetch_all(&pool).await.unwrap_or_default();
    
    let mut result = Vec::new();
    for plan in plans {
        let mut val = serde_json::to_value(&plan).unwrap();
        let obj = val.as_object_mut().unwrap();
        
        let source = sources.iter().find(|s| s.id == plan.source_id);
        obj.insert("source".to_string(), serde_json::to_value(source).unwrap());
        
        let remote = remotes.iter().find(|r| r.id == plan.remote_id);
        obj.insert("remote".to_string(), serde_json::to_value(remote).unwrap());
        
        let plan_logs: Vec<_> = logs.iter().filter(|l| l.plan_id == plan.id).take(5).collect();
        obj.insert("logs".to_string(), serde_json::to_value(plan_logs).unwrap());
        
        result.push(val);
    }
    Ok(Json(result))
}

async fn get_plan(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<Json<Plan>, String> {
    let plan = sqlx::query_as::<_, Plan>("SELECT * FROM Plan WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Json(plan))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePlan {
    name: String,
    schedule: String,
    encrypt: bool,
    password: Option<String>,
    enabled: bool,
    remote_folder_path: String,
    backup_prefix: String,
    source_id: String,
    remote_id: String,
}

async fn create_plan(State(pool): State<SqlitePool>, Json(payload): Json<CreatePlan>) -> Result<Json<Plan>, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let mut cron_str = payload.schedule.clone();
    let parts: Vec<&str> = cron_str.split_whitespace().collect();
    if parts.len() == 5 { cron_str = format!("0 {} *", cron_str); }
    if let Err(_) = cron::Schedule::from_str(&cron_str) {
        return Err("Invalid cron schedule".to_string());
    }
    let enc_pw = payload.password.map(|p| crate::encryption::encrypt_secret(&p).unwrap_or(p));

    sqlx::query("INSERT INTO Plan (id, updatedAt, name, schedule, encrypt, password, enabled, remoteFolderPath, backupPrefix, sourceId, remoteId) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&payload.name).bind(&payload.schedule).bind(payload.encrypt).bind(enc_pw)
        .bind(payload.enabled).bind(&payload.remote_folder_path).bind(&payload.backup_prefix)
        .bind(&payload.source_id).bind(&payload.remote_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
        
    get_plan(State(pool), Path(id)).await
}

async fn update_plan(State(pool): State<SqlitePool>, Path(id): Path<String>, Json(payload): Json<CreatePlan>) -> Result<Json<Plan>, String> {
    let mut cron_str = payload.schedule.clone();
    let parts: Vec<&str> = cron_str.split_whitespace().collect();
    if parts.len() == 5 { cron_str = format!("0 {} *", cron_str); }
    if let Err(_) = cron::Schedule::from_str(&cron_str) {
        return Err("Invalid cron schedule".to_string());
    }
    let enc_pw = payload.password.map(|p| crate::encryption::encrypt_secret(&p).unwrap_or(p));

    sqlx::query("UPDATE Plan SET updatedAt = CURRENT_TIMESTAMP, name = ?, schedule = ?, encrypt = ?, password = ?, enabled = ?, remoteFolderPath = ?, backupPrefix = ?, sourceId = ?, remoteId = ? WHERE id = ?")
        .bind(&payload.name).bind(&payload.schedule).bind(payload.encrypt).bind(enc_pw)
        .bind(payload.enabled).bind(&payload.remote_folder_path).bind(&payload.backup_prefix)
        .bind(&payload.source_id).bind(&payload.remote_id).bind(&id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
        
    get_plan(State(pool), Path(id)).await
}

async fn delete_plan(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<(), String> {
    sqlx::query("DELETE FROM Plan WHERE id = ?").bind(id).execute(&pool).await.map_err(|e| e.to_string())?;
    crate::sync_config::write_to_disk(&pool).await.ok();
    Ok(())
}

async fn run_plan(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<String, String> {
    tokio::spawn(async move {
        let _ = crate::rclone::execute_rclone_backup(&pool, &id).await;
    });
    Ok("Started".to_string())
}

async fn restore_plan(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<String, String> {
    tokio::spawn(async move {
        let _ = crate::rclone::execute_rclone_restore(&pool, &id, None).await;
    });
    Ok("Started".to_string())
}

#[derive(Serialize)]
#[allow(non_snake_case)]
struct CheckResponse {
    hasData: bool,
}

async fn check_plan_remote_data(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<Json<CheckResponse>, String> {
    let has_data = crate::rclone::check_plan_remote_data(&pool, &id).await?;
    Ok(Json(CheckResponse { hasData: has_data }))
}

#[derive(Serialize)]
struct PurgeResponse {
    success: bool,
}

async fn purge_plan_remote_data(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<Json<PurgeResponse>, String> {
    crate::rclone::purge_plan_remote_data(&pool, &id).await?;
    Ok(Json(PurgeResponse { success: true }))
}

async fn list_sources(State(pool): State<SqlitePool>) -> Result<Json<Vec<Source>>, String> {
    let sources = sqlx::query_as::<_, Source>("SELECT * FROM Source ORDER BY createdAt DESC")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Json(sources))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSource {
    name: String,
    path: String,
}

async fn create_source(State(pool): State<SqlitePool>, Json(payload): Json<CreateSource>) -> Result<Json<Source>, String> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO Source (id, updatedAt, name, path) VALUES (?, CURRENT_TIMESTAMP, ?, ?)")
        .bind(&id).bind(&payload.name).bind(&payload.path)
        .execute(&pool).await.map_err(|e| e.to_string())?;
        
    get_source(State(pool), Path(id)).await
}

async fn get_source(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<Json<Source>, String> {
    let source = sqlx::query_as::<_, Source>("SELECT * FROM Source WHERE id = ?").bind(id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    crate::sync_config::write_to_disk(&pool).await.ok();
    Ok(Json(source))
}

async fn update_source(State(pool): State<SqlitePool>, Path(id): Path<String>, Json(payload): Json<CreateSource>) -> Result<Json<Source>, String> {
    sqlx::query("UPDATE Source SET updatedAt = CURRENT_TIMESTAMP, name = ?, path = ? WHERE id = ?")
        .bind(&payload.name).bind(&payload.path).bind(&id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
    get_source(State(pool), Path(id)).await
}

async fn delete_source(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<(), String> {
    sqlx::query("DELETE FROM Source WHERE id = ?").bind(id).execute(&pool).await.map_err(|e| e.to_string())?;
    crate::sync_config::write_to_disk(&pool).await.ok();
    Ok(())
}

async fn list_remotes(State(pool): State<SqlitePool>) -> Result<Json<Vec<Remote>>, String> {
    let remotes = sqlx::query_as::<_, Remote>("SELECT * FROM Remote ORDER BY createdAt DESC")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Json(remotes))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRemote {
    name: String,
    #[serde(rename = "type")]
    type_: String,
    config: serde_json::Value,
}

async fn create_remote(State(pool): State<SqlitePool>, Json(mut payload): Json<CreateRemote>) -> Result<Json<Remote>, String> {
    let id = uuid::Uuid::new_v4().to_string();
    
    // Encrypt any sensitive fields in config before saving
    if let serde_json::Value::Object(ref mut map) = payload.config {
        for (k, v) in map.iter_mut() {
            if k.contains("password") || k.contains("token") || k.contains("secret") || k.contains("key") {
                if let serde_json::Value::String(s) = v {
                    if !crate::encryption::is_encrypted(s) {
                        *v = serde_json::Value::String(crate::encryption::encrypt_secret(s).unwrap_or(s.clone()));
                    }
                }
            }
        }
    }
    
    let config_str = serde_json::to_string(&payload.config).unwrap();

    sqlx::query("INSERT INTO Remote (id, updatedAt, name, type, config) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)")
        .bind(&id).bind(&payload.name).bind(&payload.type_).bind(&config_str)
        .execute(&pool).await.map_err(|e| e.to_string())?;
        
    get_remote(State(pool), Path(id)).await
}

async fn get_remote(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<Json<Remote>, String> {
    let remote = sqlx::query_as::<_, Remote>("SELECT * FROM Remote WHERE id = ?").bind(id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    crate::sync_config::write_to_disk(&pool).await.ok();
    Ok(Json(remote))
}

async fn update_remote(State(pool): State<SqlitePool>, Path(id): Path<String>, Json(mut payload): Json<CreateRemote>) -> Result<Json<Remote>, String> {
    if let serde_json::Value::Object(ref mut map) = payload.config {
        for (k, v) in map.iter_mut() {
            if k.contains("password") || k.contains("token") || k.contains("secret") || k.contains("key") {
                if let serde_json::Value::String(s) = v {
                    if !crate::encryption::is_encrypted(s) {
                        *v = serde_json::Value::String(crate::encryption::encrypt_secret(s).unwrap_or(s.clone()));
                    }
                }
            }
        }
    }
    
    let config_str = serde_json::to_string(&payload.config).unwrap();

    sqlx::query("UPDATE Remote SET updatedAt = CURRENT_TIMESTAMP, name = ?, type = ?, config = ? WHERE id = ?")
        .bind(&payload.name).bind(&payload.type_).bind(&config_str).bind(&id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
        
    get_remote(State(pool), Path(id)).await
}

async fn delete_remote(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<(), String> {
    sqlx::query("DELETE FROM Remote WHERE id = ?").bind(id).execute(&pool).await.map_err(|e| e.to_string())?;
    crate::sync_config::write_to_disk(&pool).await.ok();
    Ok(())
}

async fn list_logs(State(pool): State<SqlitePool>) -> Result<Json<Vec<serde_json::Value>>, String> {
    let logs = sqlx::query_as::<_, BackupLog>("SELECT * FROM BackupLog ORDER BY createdAt DESC LIMIT 100")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let plans = sqlx::query_as::<_, Plan>("SELECT * FROM Plan").fetch_all(&pool).await.unwrap_or_default();
    
    let mut result = Vec::new();
    for log in logs {
        let mut val = serde_json::to_value(&log).unwrap();
        let plan = plans.iter().find(|p| p.id == log.plan_id);
        val.as_object_mut().unwrap().insert("plan".to_string(), serde_json::to_value(plan).unwrap());
        result.push(val);
    }
    
    Ok(Json(result))
}

async fn delete_all_logs(State(pool): State<SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM BackupLog WHERE status = 'Success'").execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn delete_log(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<(), String> {
    sqlx::query("DELETE FROM BackupLog WHERE id = ?").bind(id).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
    user: crate::models::User,
}

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

async fn login(State(pool): State<SqlitePool>, Json(payload): Json<LoginRequest>) -> Result<Json<LoginResponse>, axum::http::StatusCode> {
    use crate::models::User;
    
    let user = sqlx::query_as::<_, User>("SELECT id, username, password FROM User WHERE username = ?")
        .bind(&payload.username)
        .fetch_optional(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    if let Some(user) = user {
        if let Some(ref hash) = user.password {
            if bcrypt::verify(&payload.password, hash).unwrap_or(false) {
                let exp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as usize + 24 * 3600;
                let claims = Claims {
                    sub: user.id.clone(),
                    exp,
                };
                
                let secret = std::env::var("AUTH_SECRET").unwrap_or_else(|_| "secret".to_string());
                let token = jsonwebtoken::encode(
                    &jsonwebtoken::Header::default(),
                    &claims,
                    &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes())
                ).map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
                
                return Ok(Json(LoginResponse {
                    token,
                    user,
                }));
            }
        }
    }
    
    Err(axum::http::StatusCode::UNAUTHORIZED)
}



#[derive(serde::Serialize)]
struct AuthStatus {
    needs_setup: bool,
    has_oidc: bool,
    oidc_name: String,
    disable_local_auth: bool,
}

async fn auth_status(State(pool): State<SqlitePool>) -> Result<Json<AuthStatus>, axum::http::StatusCode> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM User WHERE password IS NOT NULL")
        .fetch_one(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    let oidc_client_id = std::env::var("OIDC_CLIENT_ID").unwrap_or_default();
    let has_oidc = !oidc_client_id.is_empty();
    let oidc_name = std::env::var("OIDC_NAME").unwrap_or_else(|_| "Single Sign-On (OIDC)".to_string());
    let disable_local = std::env::var("DISABLE_LOCAL_AUTH").unwrap_or_default() == "true";
    
    Ok(Json(AuthStatus {
        needs_setup: count.0 == 0,
        has_oidc,
        oidc_name,
        disable_local_auth: disable_local,
    }))
}

async fn setup_admin(State(pool): State<SqlitePool>, Json(payload): Json<LoginRequest>) -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM User WHERE password IS NOT NULL")
        .fetch_one(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    if count.0 > 0 {
        return Err(axum::http::StatusCode::FORBIDDEN);
    }
    
    let hash = bcrypt::hash(&payload.password, 10).unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    
    sqlx::query("INSERT INTO User (id, username, password, email) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&payload.username)
        .bind(&hash)
        .bind(format!("{}@localhost", payload.username))
        .execute(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    Ok(Json(serde_json::json!({ "success": true })))
}

use axum::response::Redirect;
use axum::extract::Query;

#[derive(Deserialize)]
struct OidcCallbackParams {
    code: String,
}

#[derive(Deserialize)]
struct OidcConfig {
    authorization_endpoint: String,
    token_endpoint: String,
    userinfo_endpoint: String,
}

async fn get_oidc_config(issuer: &str) -> Option<OidcConfig> {
    let url = std::env::var("OIDC_WELL_KNOWN_URL")
        .unwrap_or_else(|_| format!("{}/.well-known/openid-configuration", issuer.trim_end_matches('/')));
    reqwest::get(&url).await.ok()?.json::<OidcConfig>().await.ok()
}

async fn oidc_login() -> Redirect {
    let issuer = std::env::var("OIDC_ISSUER").unwrap_or_default();
    let client_id = std::env::var("OIDC_CLIENT_ID").unwrap_or_default();
    
    let mut auth_endpoint = format!("{}protocol/openid-connect/auth", issuer);
    if let Some(config) = get_oidc_config(&issuer).await {
        auth_endpoint = config.authorization_endpoint;
    }
    
    let auth_url = format!("{}?client_id={}&response_type=code&scope=openid profile email&redirect_uri=http://localhost:5173/api/auth/oidc/callback", auth_endpoint, client_id);
    Redirect::temporary(&auth_url)
}

async fn oidc_callback(State(pool): State<SqlitePool>, Query(params): Query<OidcCallbackParams>) -> Redirect {
    let issuer = std::env::var("OIDC_ISSUER").unwrap_or_default();
    let client_id = std::env::var("OIDC_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("OIDC_CLIENT_SECRET").unwrap_or_default();
    
    let mut token_url = format!("{}protocol/openid-connect/token", issuer);
    let mut userinfo_url = format!("{}protocol/openid-connect/userinfo", issuer);
    if let Some(config) = get_oidc_config(&issuer).await {
        token_url = config.token_endpoint;
        userinfo_url = config.userinfo_endpoint;
    }
    
    let client = reqwest::Client::new();
    let res = client.post(&token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &params.code),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("redirect_uri", "http://localhost:5173/api/auth/oidc/callback"),
        ])
        .send()
        .await;
        
    if let Ok(response) = res {
        if let Ok(json) = response.json::<serde_json::Value>().await {
            if let Some(access_token) = json.get("access_token").and_then(|v| v.as_str()) {
                // Fetch user info
                if let Ok(userinfo_res) = client.get(&userinfo_url).bearer_auth(access_token).send().await {
                    if let Ok(userinfo) = userinfo_res.json::<serde_json::Value>().await {
                        let email = userinfo.get("email").and_then(|v| v.as_str()).unwrap_or("oidc@localhost");
                        let username = userinfo.get("preferred_username").and_then(|v| v.as_str()).unwrap_or(email);
                        
                        // Upsert user
                        use crate::models::User;
                        let existing = sqlx::query_as::<_, User>("SELECT * FROM User WHERE email = ?")
                            .bind(email)
                            .fetch_optional(&pool)
                            .await.unwrap_or(None);
                            
                        let user_id = if let Some(u) = existing {
                            u.id
                        } else {
                            let new_id = uuid::Uuid::new_v4().to_string();
                            let _ = sqlx::query("INSERT INTO User (id, username, email) VALUES (?, ?, ?)")
                                .bind(&new_id)
                                .bind(username)
                                .bind(email)
                                .execute(&pool)
                                .await;
                            new_id
                        };
                        
                        // Generate JWT
                        let exp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as usize + 24 * 3600;
                        let claims = Claims { sub: user_id, exp };
                        let secret = std::env::var("AUTH_SECRET").unwrap_or_else(|_| "secret".to_string());
                        let token = jsonwebtoken::encode(
                            &jsonwebtoken::Header::default(),
                            &claims,
                            &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes())
                        ).unwrap_or_default();
                        
                        // Redirect to frontend with token
                        return Redirect::temporary(&format!("/login?token={}", token));
                    }
                }
            }
        }
    }
    
    Redirect::temporary("/login?error=oidc_failed")
}


#[derive(serde::Deserialize)]
struct ExportRequest {
    password: Option<String>,
}

async fn export_config(
    State(pool): State<SqlitePool>,
    Json(payload): Json<ExportRequest>,
) -> Result<String, axum::http::StatusCode> {
    use crate::models::{User, Remote, Source, Plan};
    use crate::encryption::decrypt_secret;

    let admin = sqlx::query_as::<_, User>("SELECT id, username, password FROM User WHERE password IS NOT NULL LIMIT 1")
        .fetch_optional(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    if let Some(admin) = admin {
        if let Some(hash) = admin.password {
            if let Some(pass) = payload.password {
                if !bcrypt::verify(&pass, &hash).unwrap_or(false) {
                    return Err(axum::http::StatusCode::UNAUTHORIZED);
                }
            } else {
                return Err(axum::http::StatusCode::UNAUTHORIZED);
            }
        }
    }

    let remotes = sqlx::query_as::<_, Remote>("SELECT * FROM Remote")
        .fetch_all(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    let sources = sqlx::query_as::<_, Source>("SELECT * FROM Source")
        .fetch_all(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
    let plans = sqlx::query_as::<_, Plan>("SELECT * FROM Plan")
        .fetch_all(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut doc = serde_yaml::Mapping::new();
    
    // Remotes
    let mut remotes_seq = Vec::new();
    for r in remotes {
        let mut map = serde_yaml::Mapping::new();
        map.insert(serde_yaml::Value::String("id".to_string()), serde_yaml::Value::String(r.id));
        map.insert(serde_yaml::Value::String("name".to_string()), serde_yaml::Value::String(r.name));
        map.insert(serde_yaml::Value::String("type".to_string()), serde_yaml::Value::String(r.type_));
        
        let mut config_val: serde_yaml::Value = serde_yaml::from_str(&r.config).unwrap_or_else(|_| serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        
        if let serde_yaml::Value::Mapping(ref mut c) = config_val {
            for key in ["pass", "password", "token", "client_secret"] {
                let k = serde_yaml::Value::String(key.to_string());
                if let Some(v) = c.get_mut(&k) {
                    if let Some(v_str) = v.as_str() {
                        if let Ok(dec) = decrypt_secret(v_str) {
                            *v = serde_yaml::Value::String(dec);
                        } else {
                            println!("Failed to decrypt key {}", key);
                        }
                    }
                }
            }
        }
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
                if let Ok(dec) = decrypt_secret(&pass) {
                    map.insert(serde_yaml::Value::String("password".to_string()), serde_yaml::Value::String(dec));
                } else {
                    map.insert(serde_yaml::Value::String("password".to_string()), serde_yaml::Value::String(pass));
                }
            }
        }
        
        map.insert(serde_yaml::Value::String("enabled".to_string()), serde_yaml::Value::Bool(p.enabled));
        map.insert(serde_yaml::Value::String("remoteFolderPath".to_string()), serde_yaml::Value::String(p.remote_folder_path));
        map.insert(serde_yaml::Value::String("backupPrefix".to_string()), serde_yaml::Value::String(p.backup_prefix));
        map.insert(serde_yaml::Value::String("status".to_string()), serde_yaml::Value::String(p.status));
        
        plans_seq.push(serde_yaml::Value::Mapping(map));
    }
    doc.insert(serde_yaml::Value::String("plans".to_string()), serde_yaml::Value::Sequence(plans_seq));

    let yaml_str = serde_yaml::to_string(&doc).unwrap_or_default();
    Ok(yaml_str)
}


#[derive(serde::Deserialize)]
struct ListDirRequest {
    path: String,
}

#[derive(serde::Serialize)]
struct DirItem {
    name: String,
    path: String,
}

#[derive(serde::Serialize)]
struct ListDirResponse {
    success: bool,
    directories: Option<Vec<DirItem>>,
    #[serde(rename = "currentPath")]
    current_path: Option<String>,
    error: Option<String>,
}

async fn list_directories(
    Json(payload): Json<ListDirRequest>,
) -> Result<Json<ListDirResponse>, String> {
    let target_dir = if payload.path.is_empty() { "/".to_string() } else { payload.path.clone() };
    let path = std::path::Path::new(&target_dir);
    
    let mut directories = Vec::new();
    
    if target_dir != "/" && target_dir != "C:\\" {
        if let Some(parent) = path.parent() {
            directories.push(DirItem {
                name: "..".to_string(),
                path: parent.to_string_lossy().into_owned(),
            });
        }
    }
    
    let mut dirs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let file_name = entry.file_name().to_string_lossy().into_owned();
                    if !file_name.starts_with('.') {
                        dirs.push(DirItem {
                            name: file_name,
                            path: entry.path().to_string_lossy().into_owned(),
                        });
                    }
                }
            }
        }
    } else {
        return Ok(Json(ListDirResponse {
            success: false,
            directories: None,
            current_path: None,
            error: Some("Failed to load directory".to_string()),
        }));
    }
    
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    directories.extend(dirs);
    
    Ok(Json(ListDirResponse {
        success: true,
        directories: Some(directories),
        current_path: Some(target_dir),
        error: None,
    }))
}


async fn cancel_plan(State(pool): State<SqlitePool>, Path(id): Path<String>) -> Result<(), String> {
    if let Some(tx) = crate::EVENT_TX.get() { let _ = tx.send(()); }
    let _ = tokio::process::Command::new("pkill")
        .arg("-f")
        .arg(&format!("rclone.*{}", id))
        .status()
        .await;
        
    let plan: Option<Plan> = sqlx::query_as("SELECT * FROM Plan WHERE id = ?")
        .bind(&id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;
        
    if let Some(p) = plan {
        if p.status == "Running" || p.status == "Restoring" {
            sqlx::query("UPDATE Plan SET status = 'Error', updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(&id).execute(&pool).await.map_err(|e| e.to_string())?;
                
            let latest_log: Option<(String,)> = sqlx::query_as("SELECT id FROM BackupLog WHERE planId = ? AND status IN ('Running', 'Restoring') ORDER BY createdAt DESC LIMIT 1")
                .bind(&id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;
                
            if let Some((log_id,)) = latest_log {
                sqlx::query("UPDATE BackupLog SET status = 'Failed', message = 'Aborted by user', completedAt = CURRENT_TIMESTAMP WHERE id = ?")
                    .bind(log_id).execute(&pool).await.map_err(|e| e.to_string())?;
            }
        }
    }
    
    Ok(())
}

async fn sse_handler() -> axum::response::sse::Sse<impl tokio_stream::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>> {
    let tx = crate::EVENT_TX.get().expect("EVENT_TX not initialized");
    let rx = tx.subscribe();
    let stream = tokio_stream::wrappers::BroadcastStream::new(rx)
        .map(|_| Ok(axum::response::sse::Event::default().data("update")));
    axum::response::sse::Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new())
}
