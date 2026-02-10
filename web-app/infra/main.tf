terraform {
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.130"
    }
  }
  required_version = ">= 1.0"
}

provider "yandex" {
  token     = var.yc_token
  cloud_id  = var.yc_cloud_id
  folder_id = var.yc_folder_id
  zone      = var.yc_zone
}

# ─── Service Account ───────────────────────────────────

resource "yandex_iam_service_account" "drevo_sa" {
  name        = "${var.project_name}-sa"
  description = "Service account for Drevo web app"
}

resource "yandex_resourcemanager_folder_iam_member" "sa_editor" {
  folder_id = var.yc_folder_id
  role      = "editor"
  member    = "serviceAccount:${yandex_iam_service_account.drevo_sa.id}"
}

resource "yandex_iam_service_account_static_access_key" "sa_static_key" {
  service_account_id = yandex_iam_service_account.drevo_sa.id
  description        = "Static access key for Object Storage"
}

# ─── Object Storage: SPA ───────────────────────────────

resource "yandex_storage_bucket" "spa" {
  access_key = yandex_iam_service_account_static_access_key.sa_static_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.sa_static_key.secret_key
  bucket     = "${var.project_name}-spa"
  acl        = "public-read"

  website {
    index_document = "index.html"
    error_document = "index.html"
  }
}

# ─── Object Storage: Media ─────────────────────────────

resource "yandex_storage_bucket" "media" {
  access_key = yandex_iam_service_account_static_access_key.sa_static_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.sa_static_key.secret_key
  bucket     = "${var.project_name}-media"
  acl        = "private"
}

# ─── YDB Serverless ───────────────────────────────────

resource "yandex_ydb_database_serverless" "db" {
  name      = "${var.project_name}-db"
  folder_id = var.yc_folder_id
}

# ─── Cloud Function: API ──────────────────────────────

resource "yandex_function" "api" {
  name               = "${var.project_name}-api"
  description        = "Drevo API function"
  user_hash          = filesha256("${path.module}/../functions/dist/api.zip")
  runtime            = "nodejs18"
  entrypoint         = "handler.handler"
  memory             = 256
  execution_timeout  = "10"
  service_account_id = yandex_iam_service_account.drevo_sa.id

  environment = {
    JWT_SECRET      = var.jwt_secret
    YDB_ENDPOINT    = yandex_ydb_database_serverless.db.ydb_api_endpoint
    YDB_DATABASE    = yandex_ydb_database_serverless.db.database_path
    MEDIA_MOUNT     = "/mnt/media"
  }

  storage_mounts {
    mount_point_name = "media"
    bucket           = yandex_storage_bucket.media.bucket
    prefix           = ""
    read_only        = false
  }

  content {
    zip_filename = "${path.module}/../functions/dist/api.zip"
  }
}

# ─── API Gateway ──────────────────────────────────────

resource "yandex_api_gateway" "gateway" {
  name        = "${var.project_name}-gateway"
  description = "API Gateway for Drevo web app"

  spec = templatefile("${path.module}/gateway.yaml", {
    function_id = yandex_function.api.id
    sa_id       = yandex_iam_service_account.drevo_sa.id
    spa_bucket  = yandex_storage_bucket.spa.bucket
  })
}

# ─── Outputs ──────────────────────────────────────────

output "api_gateway_domain" {
  value       = yandex_api_gateway.gateway.domain
  description = "API Gateway auto-generated domain"
}

output "spa_bucket_name" {
  value       = yandex_storage_bucket.spa.bucket
  description = "SPA bucket name"
}

output "media_bucket_name" {
  value       = yandex_storage_bucket.media.bucket
  description = "Media bucket name"
}

output "ydb_endpoint" {
  value       = yandex_ydb_database_serverless.db.ydb_api_endpoint
  description = "YDB gRPC endpoint"
}

output "ydb_database" {
  value       = yandex_ydb_database_serverless.db.database_path
  description = "YDB database path"
}
