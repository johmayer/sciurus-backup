use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/api/health", get(|| async { "OK" }))
        .nest("/api", Router::new().route("/hello", get(|| async { "Hello" })));
    
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
