pub static EVENT_TX: std::sync::OnceLock<tokio::sync::broadcast::Sender<()>> = std::sync::OnceLock::new();
mod models;
mod rclone;
mod encryption;
mod api;
mod scheduler;
mod sync_config;

use tower_http::services::{ServeDir, ServeFile};
use axum::{routing::get, Router};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::ConnectOptions;
use std::str::FromStr;
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    println!("Starting Sciurus Backup Rust Backend...");

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:data/sciurus.db".to_string());
    
    // Ensure the data directory exists
    if db_url.starts_with("sqlite:") {
        let path = db_url.trim_start_matches("sqlite:");
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
    }
    
    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .disable_statement_logging();

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Execute the schema directly
    let schema = include_str!("../schema.sql");
    for query in schema.split(';') {
        let query = query.trim();
        if !query.is_empty() {
            sqlx::query(query).execute(&pool).await?;
        }
    }

    println!("Database connected and schema initialized!");
    let (tx, _rx) = tokio::sync::broadcast::channel::<()>(100);
    crate::EVENT_TX.set(tx.clone()).unwrap();

    if let Err(e) = sync_config::sync_to_db(&pool).await {
        eprintln!("[Sync] Error syncing config.yaml: {}", e);
    }

    let pool_for_sched = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = scheduler::setup_scheduler(pool_for_sched).await {
            eprintln!("Scheduler error: {}", e);
        }
    });

    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "public".to_string());
    
    let app = Router::new()
        .fallback_service(ServeDir::new(&frontend_dir).fallback(ServeFile::new(format!("{}/index.html", frontend_dir))))
        .route("/api/health", get(|| async { "OK" }))
        .nest("/api", api::router())
        .with_state(pool.clone());

// Restart any plans that were running when the server crashed
    let crashed_plans = sqlx::query_as::<_, crate::models::Plan>("SELECT * FROM Plan WHERE status IN ('Running', 'Restoring')")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
        
    for plan in crashed_plans {
        println!("Found crashed plan: {} ({}). Restarting...", plan.name, plan.id);
        
        let _ = tokio::process::Command::new("pkill")
            .arg("-f")
            .arg(&format!("rclone.*{}", plan.id))
            .status()
            .await;
            
        let _ = sqlx::query("UPDATE BackupLog SET status = 'Error', message = 'Server crashed, aborted' WHERE planId = ? AND status IN ('Running', 'Restoring')")
            .bind(&plan.id)
            .execute(&pool).await;
            
        let is_restore = plan.status == "Restoring";
            
        let _ = sqlx::query("UPDATE Plan SET status = 'Active' WHERE id = ?")
            .bind(&plan.id)
            .execute(&pool).await;
            
        let pool_c = pool.clone();
        let plan_id = plan.id.clone();
        
        tokio::spawn(async move {
            if is_restore {
                let _ = crate::rclone::execute_rclone_restore(&pool_c, &plan_id, None).await;
            } else {
                let _ = crate::rclone::execute_rclone_backup(&pool_c, &plan_id).await;
            }
        });
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("Listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
