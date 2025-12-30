-- Run with: psql -d code_analytics -f schema.sql

CREATE TABLE IF NOT EXISTS config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source, metric_type, date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_lookup
ON metrics(source, metric_type, date);
