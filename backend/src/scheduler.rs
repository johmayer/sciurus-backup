use sqlx::SqlitePool;
use tokio_cron_scheduler::{JobScheduler, Job};
use cron::Schedule;
use std::str::FromStr;
use chrono::Local;

pub async fn setup_scheduler(pool: SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    let sched = JobScheduler::new().await?;

    let pool_clone = pool.clone();
    sched.add(
        Job::new_async("0 * * * * *", move |_uuid, _l| {
            let pool = pool_clone.clone();
            Box::pin(async move {
                let now = Local::now();
                
                let plans = sqlx::query_as::<_, crate::models::Plan>("SELECT * FROM Plan WHERE enabled = 1 AND status = 'Active'")
                    .fetch_all(&pool).await.unwrap_or_default();
                    
                for plan in plans {
                    let mut cron_str = plan.schedule.clone();
                    let parts: Vec<&str> = cron_str.split_whitespace().collect();
                    if parts.len() == 5 {
                        cron_str = format!("0 {} *", cron_str);
                    }
                    
                    if let Ok(schedule) = Schedule::from_str(&cron_str) {
                        if schedule.includes(now) {
                            println!("Triggering scheduled backup for plan: {}", plan.name);
                            let pool_c = pool.clone();
                            let plan_id = plan.id.clone();
                            tokio::spawn(async move {
                                let _ = crate::rclone::execute_rclone_backup(&pool_c, &plan_id).await;
                            });
                        }
                    }
                }
            })
        })?
    ).await?;
    
    sched.start().await?;
    Ok(())
}
