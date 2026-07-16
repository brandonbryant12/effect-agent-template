{{- define "effect-agent.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "effect-agent.env" -}}
- name: NODE_ENV
  value: {{ .Values.config.nodeEnv | quote }}
- name: DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret }}, key: database-url } }
- name: WEB_ORIGIN
  value: {{ .Values.config.webOrigin | quote }}
- name: SERVER_PUBLIC_URL
  value: {{ .Values.config.serverPublicUrl | quote }}
- name: CREDENTIAL_BROKER_URL
  value: {{ .Values.config.credentialBrokerUrl | quote }}
{{- end }}

{{- define "effect-agent.serverEnv" -}}
{{ include "effect-agent.env" . }}
- name: BETTER_AUTH_SECRET
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret }}, key: better-auth-secret } }
- name: CREDENTIAL_UPLOAD_SIGNING_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret }}, key: credential-upload-signing-key } }
- name: AI_PROVIDER
  value: {{ .Values.config.aiProvider | quote }}
{{- end }}

{{- define "effect-agent.brokerEnv" -}}
{{ include "effect-agent.serverEnv" . }}
- name: SECRET_STORE_PROVIDER
  value: {{ .Values.config.secretStoreProvider | quote }}
- name: AWS_REGION
  value: {{ .Values.config.awsRegion | quote }}
- name: SECRET_NAME_PREFIX
  value: {{ .Values.config.secretNamePrefix | quote }}
{{- end }}

{{- define "effect-agent.workerEnv" -}}
{{ include "effect-agent.env" . }}
- name: SANDBOX_PROVIDER
  value: {{ .Values.config.sandboxProvider | quote }}
- name: OPEN_SANDBOX_DOMAIN
  value: {{ .Values.config.openSandboxDomain | quote }}
- name: OPEN_SANDBOX_IMAGE
  value: {{ .Values.config.openSandboxImage | quote }}
- name: OPEN_SANDBOX_ALLOWED_HOSTS
  value: {{ .Values.config.openSandboxAllowedHosts | quote }}
- name: OPEN_SANDBOX_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret }}, key: opensandbox-api-key } }
{{- end }}
