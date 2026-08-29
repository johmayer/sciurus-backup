use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub name: String,
    pub schedule: String,
    pub encrypt: bool,
    pub password: Option<String>,
    pub enabled: bool,
    pub remote_folder_path: String,
    pub backup_prefix: String,
    pub status: String,
    pub last_backup_size: Option<i64>,
    pub last_backup_files: Option<i64>,
    pub source_id: String,
    pub remote_id: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub id: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub name: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub type_: String, // 'type' is a reserved keyword in Rust
    pub config: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct BackupLog {
    pub id: String,
    pub created_at: chrono::NaiveDateTime,
    pub plan_id: String,
    pub status: String,
    pub message: Option<String>,
    pub bytes: Option<i64>,
    pub files: Option<i64>,
    pub raw_output: Option<String>,
    pub completed_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub username: Option<String>,
    pub password: Option<String>,
}
