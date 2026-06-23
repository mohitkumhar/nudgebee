ALTER TABLE messaging_platforms
ADD CONSTRAINT uq_messaging_platforms_tenant_platform UNIQUE (tenant_id, platform);
