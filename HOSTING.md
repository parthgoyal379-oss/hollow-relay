# Realtime Hosting Notes

The co-op room server uses in-memory match state and holds WebSocket connections. It requires one persistent process rather than Autoscale's request-scoped replicas. The approved approach is Manus WebDev **Reserved Hosting**; its server process stays live and supports persistent connections. Autoscale is not suitable for long-lived room state because of cold starts, multiple pods, and websocket disconnects.

**Approval:** The project owner explicitly selected “Enable the always-on room server and proceed with online co-op” after being shown usage-based billing. Full-utilization ceiling previously quoted for this project: about $37.50/month before the included $10/month credit, plus metered egress. Actual usage may be lower and must be monitored.

**Settings constraint:** Official Manus hosting documentation states that the hosting-mode dialog is in the settings of a **published** project. The current Manus WebDev MCP inventory exposes no host-mode setting API. This project has not been published yet. Keep any first deployment private if the publishing UI allows it; request a separate explicit confirmation before making the game publicly accessible.

## Sources
- Manus, [Publishing and hosting modes](https://manus.im/docs/website-builder/publishing)
- Manus, [Introducing Hosting Modes](https://manus.im/blog/manus-hosting-web-builder) (2026-06-24): Reserved is a single persistent instance; up to about $36/month at full utilization and $10 monthly account credits; select hosting mode from published project settings.
- Manus Persistent Computing skill, `references/reserved-hosting-reference.md` (read in the current task): Reserved supports the persistent Node server within 1 vCPU / 512 MB; estimated max cost $37.50/month before $10 credit, plus egress.
