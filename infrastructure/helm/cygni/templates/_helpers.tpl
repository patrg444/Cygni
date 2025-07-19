{{/*
Expand the name of the chart.
*/}}
{{- define "cygni.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "cygni.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "cygni.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "cygni.labels" -}}
helm.sh/chart: {{ include "cygni.chart" . }}
{{ include "cygni.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "cygni.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cygni.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "cygni.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cygni.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create PostgreSQL connection string
*/}}
{{- define "cygni.postgresqlUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- $host := printf "%s-postgresql" (include "cygni.fullname" .) }}
{{- $port := "5432" }}
{{- $database := .Values.postgresql.auth.database }}
{{- $username := .Values.postgresql.auth.username }}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%s/%s" $username $host $port $database }}
{{- end }}
{{- end }}

{{/*
Create Redis connection string
*/}}
{{- define "cygni.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- $host := printf "%s-redis-master" (include "cygni.fullname" .) }}
{{- $port := "6379" }}
{{- if .Values.redis.auth.enabled }}
{{- printf "redis://:$(REDIS_PASSWORD)@%s:%s" $host $port }}
{{- else }}
{{- printf "redis://%s:%s" $host $port }}
{{- end }}
{{- end }}
{{- end }}