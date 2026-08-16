# Graph Report - porac-sdss  (2026-08-16)

## Corpus Check
- Large corpus: 543 files · ~282,734 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2967 nodes · 6394 edges · 189 communities (135 shown, 54 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 188 edges (avg confidence: 0.79)
- Token cost: 1,005,479 input · 0 output

## Community Hubs (Navigation)
- Admin Layout & Map Controls
- Admin/App Error Boundaries & Role Management
- Admin Playwright E2E Specs
- DB Migration Scripts
- Citizen Layout & Notification Center
- Moderation Service & Ticket Constants
- Admin Page Shells & Skeletons
- Root pnpm Scripts
- Admin Audit Controller/Service
- Distance Utils, Cron Controller & App Config
- Barangay Geo & Dashboard Controllers
- Activity Log Workspace UI
- Citizen Report Detail Page
- Notifications Controller & Session Cookie
- Admin Controllers (Account/Audit/Directory/Insights/Moderation)
- Google OAuth Controller & Session
- Admin Sub-Pages (Account/Barangay/Flagged/Login)
- Admin Map Client (MapClient.tsx)
- Flagged Reports Workspace UI
- Auth/Session/Ticket Service Specs
- Tickets Controller (advance/detail/geo/moderate)
- Work Orders Service
- Hazard Urgency Triage Formula (rationale)
- Ticket Queue Workspace & Status Pills
- API Runtime Dependencies (NestJS/Drizzle/Cloudinary)
- Password Reset Controller
- Auth Controller & Admin Cookie Util
- Citizen Session Guard/Decorator
- Admin Account Controller (Password Change)
- Admin Directory/Admins Controller
- Citizen Report Submission Form
- Admin Dashboard Client (Charts)
- Barangay Insights Controller/Service
- Citizen Account Controller & Cookie Util
- Google OAuth Provider & Controller
- Root tsconfig.json
- Session Service (sign/verify)
- Ticket/Location Map Components
- Root devDependencies (lint/test tooling)
- GIS Seed Scripts (barangays/city-boundary/DEM)
- Category Routing & Media/EXIF Service
- Citizen Sub-Pages (Dashboard/Map/Reports/Unauthorized)
- Database Reference Doc & Tables
- Admin Auth Service & Email Normalization
- NestJS Feature Modules
- Drizzle Schema (audit/rate-limit/enums)
- Ticket Detail Page (status/evidence/timeline)
- Admin Reports Service (CSV Export)
- Frontend UI Dependencies (leaflet/lucide/cmdk)
- Admin Command Palette (AdminSearch)
- EXIF Util & Report Seed Scripts
- API tsconfig.json
- shadcn components.json Config
- Dashboard Distribution Charts
- API package.json (Jest config)
- Activity Log & Admin Management Pages
- Citizen Auth Pages (Login/Signup/Forgot-Password)
- Features Doc (Admin/Citizen Flows)
- shadcn CLI Reference (init/add/search/view)
- shadcn Theming & Customization
- Elevation/Weather/Recompute Services & Scoring
- Cron Controller (recompute/cleanup/escalation)
- Admin Dashboard & Reports Pages
- Email Templates & Resend Service
- Barangay Trend Chart & shadcn Chart Primitive
- Test DB Isolation Spike Doc
- Hazard Urgency Badge UI Utils
- Deployment Backlog Issue Docs (#71-78)
- App Controller/Service (health check)
- Security Hardening Plan Doc (R2/R3/R8/R10)
- Session Verify Helpers (Next.js lightweight)
- Barangay Insights Page & Types
- Citizen Route Error Boundaries
- shadcn Base-vs-Radix Rules
- shadcn Component Composition Rules
- API tsconfig.build.json
- Triage Model Doc (Dedup/Scoring Formulas)
- Terminology Doc & Manuscript-Alignment Phases 2-6
- Barangay Resolution & GADM-to-PSGC Migration
- shadcn Registry Authoring
- shadcn MCP Server Tools
- shadcn Chat & Messaging Components
- Citizen Account Security Panel
- Project Status Doc & Repo-Owned Skills
- Security Model Doc (Auth/RBAC/Sessions)
- Deployment Readiness Doc & Cron Jobs
- Build-Recovery Verification Script
- Moderation Controller
- Reports Controller (CSV Export)
- Email Service Interface
- Moderation Queue UI Components
- Admin Management Dialogs (Create/Deactivate/Reset)
- PLAN.md Design Migration Phases
- shadcn Forms & Inputs Rules
- API devDependencies (types/eslint-plugin)
- Admin Ticket Types (Detail/Reassignment/Referral)
- Work Orders Feature (Table/Docs)
- Flagged Workspace Query Helpers
- Design System v3 & Product Principles
- useKeypress Hook
- shadcn add/diff Commands & Presets
- API nest-cli.json
- Urgency Domain Logic (computeUrgency)
- Root package.json
- API package.json Scripts
- GIS Boundary Generator Script
- piexifjs Type Declarations
- Drizzle DbModule
- clean-build-cache.js Script
- Operational Priority UI Utils
- Root App Layout (Fonts/Metadata)
- Horizontal Status Tracker Component
- Create Work Order Dialog
- Admin Account Security Panel (duplicate)
- Ticket Resolve Dialog
- Work Orders Panel
- Security Issues: Login Throttling/Audit/Trust Proxy
- Reliability Issues: Free-Text Bounds/Email/Env Validation
- Testing Issues: DB Isolation/CI/Job Summary
- shadcn Agent Config (openai.yml, mirrored)
- drizzle-kit dependency
- eslint dependency
- eslint-config-prettier dependency
- @eslint/eslintrc dependency
- @eslint/js dependency
- globals dependency
- jest dependency
- @nestjs/cli dependency
- @nestjs/schematics dependency
- @nestjs/testing dependency
- prettier dependency
- source-map-support dependency
- supertest dependency
- ts-jest dependency
- ts-loader dependency
- ts-node dependency
- tsconfig-paths dependency
- tsx dependency
- @types/bcryptjs dependency
- @types/cookie-parser dependency
- @types/jest dependency
- @types/multer dependency
- typescript dependency
- typescript-eslint dependency
- clsx dependency
- Root ESLint Config
- Security Issues: HTTP Headers/CSP
- Testing Issues: Report Creation/Fixture Strategy
- leaflet.heat dependency
- Next.js Config (next.config.ts)
- next-env.d.ts
- jose dependency
- piexifjs dependency
- radix-ui dependency
- react dependency
- react-dom dependency
- react-leaflet dependency
- react-leaflet-cluster dependency
- shadcn dependency
- tailwind-merge dependency
- tw-animate-css dependency
- postcss.config.mjs
- Next.js Breaking-Conventions Note (AGENTS.md)
- shadcn Logo Asset
- shadcn Small Logo Asset
- shadcn Logo Icon Asset (mirror)
- shadcn Small Logo Asset (mirror)
- Leaflet Marker Icon Asset
- Leaflet Marker Icon Asset (2x)
- Leaflet Marker Shadow Asset

## God Nodes (most connected - your core abstractions)
1. `cn()` - 151 edges
2. `AdminSession` - 83 edges
3. `scripts` - 54 edges
4. `client` - 50 edges
5. `Env` - 42 edges
6. `SessionService` - 41 edges
7. `CurrentAdmin` - 38 edges
8. `NotificationsService` - 35 edges
9. `Button()` - 34 edges
10. `AdminAuditService` - 31 edges

## Surprising Connections (you probably didn't know these)
- `shadcn Skill` --semantically_similar_to--> `shadcn Skill (.claude mirror)`  [INFERRED] [semantically similar]
  .agents/skills/shadcn/SKILL.md → .claude/skills/shadcn/SKILL.md
- `shadcn CLI Reference` --semantically_similar_to--> `shadcn CLI Reference (.claude mirror)`  [INFERRED] [semantically similar]
  .agents/skills/shadcn/cli.md → .claude/skills/shadcn/cli.md
- `Customization & Theming` --semantically_similar_to--> `Customization & Theming (.claude mirror)`  [INFERRED] [semantically similar]
  .agents/skills/shadcn/customization.md → .claude/skills/shadcn/customization.md
- `shadcn MCP Server` --semantically_similar_to--> `shadcn MCP Server (.claude mirror)`  [INFERRED] [semantically similar]
  .agents/skills/shadcn/mcp.md → .claude/skills/shadcn/mcp.md
- `Registry Authoring and Addresses` --semantically_similar_to--> `Registry Authoring and Addresses (.claude mirror)`  [INFERRED] [semantically similar]
  .agents/skills/shadcn/registry.md → .claude/skills/shadcn/registry.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Chat UI Composition Flow (MessageScroller/Message/Bubble/Attachment/Marker)** — agents_skills_shadcn_rules_chat_messagescroller, agents_skills_shadcn_rules_chat_message, agents_skills_shadcn_rules_chat_bubble, agents_skills_shadcn_rules_chat_attachment, agents_skills_shadcn_rules_chat_marker [EXTRACTED 1.00]
- **Preset Switching Decision Flow (overwrite/merge/skip via apply+init+dry-run)** — agents_skills_shadcn_cli_apply_command, agents_skills_shadcn_cli_init_command, agents_skills_shadcn_cli_dry_run_mode, agents_skills_shadcn_skill_updating_components [INFERRED 0.85]
- **Registry Item Authoring Flow (root registry.json, include, item definitions, dependencies, build)** — agents_skills_shadcn_registry_root_registry_json, agents_skills_shadcn_registry_include, agents_skills_shadcn_registry_item_definitions, agents_skills_shadcn_registry_registry_dependencies, agents_skills_shadcn_registry_build_and_verify [EXTRACTED 1.00]
- **Manuscript Alignment Phases 1-6** — docs_project_status_md_manuscript_alignment_phase6, docs_project_status_md_manuscript_alignment_phase5, docs_project_status_md_manuscript_alignment_phase4, docs_project_status_md_manuscript_alignment_phase3, docs_project_status_md_manuscript_alignment_phase3_followup, docs_project_status_md_manuscript_alignment_phase2 [EXTRACTED 1.00]
- **Security Hardening Items R1/R2/R3/R4/R10 (Shipped)** — docs_security_hardening_plan_md_r1_login_throttling, docs_security_hardening_plan_md_r2_headers, docs_security_hardening_plan_md_r3_free_text, docs_security_hardening_plan_md_r4_login_audit, docs_security_hardening_plan_md_r10_ssr_boundary, docs_deployment_readiness_md_security_readiness [EXTRACTED 1.00]
- **Urgency Triage Engine: Elevation, Precipitation, Cluster Density Factors** — plan_md_elevation_factor_formula, plan_md_precipitation_factor_formula, plan_md_cluster_density_formula, claude_md_urgency_triage, docs_features_md_urgency_scoring [EXTRACTED 1.00]
- **The four office-scoping/security test-coverage issue drafts (007-010)** — github_issue_drafts_007_security_test_office_scoped_exports_office_scoped_csv_export_tests, github_issue_drafts_008_security_test_work_order_office_scoping_work_order_office_scoping_tests, github_issue_drafts_009_security_test_reassignment_behavior_reassignment_behavior_tests, github_issue_drafts_010_security_test_citizen_cross_account_access_citizen_cross_account_access_test [EXTRACTED 1.00]
- **The four testing-infrastructure issue drafts (016-019: report budget, fixture strategy, DB isolation spike, Playwright-in-CI)** — github_issue_drafts_016_testing_reduce_report_creation_reduce_report_creation, github_issue_drafts_017_testing_shared_fixture_strategy_shared_fixture_strategy, github_issue_drafts_018_testing_db_isolation_plan_db_isolation_plan, github_issue_drafts_019_testing_playwright_ci_playwright_ci [EXTRACTED 1.00]
- **The three error-boundary reliability issue drafts (011-013)** — github_issue_drafts_011_reliability_ssr_error_boundaries_ssr_error_boundaries, github_issue_drafts_012_reliability_citizen_error_boundary_retry_citizen_error_boundary_retry_fix, github_issue_drafts_013_reliability_api_unavailable_fallback_ui_api_unavailable_fallback_ui [EXTRACTED 1.00]
- **Deployment-Blocked Issue Cluster (#022-#028)** — github_issue_drafts_022_deployment_runbook_runbook, github_issue_drafts_023_deployment_postgis_production_setup_postgis_setup, github_issue_drafts_024_deployment_backup_restore_verification_backup_restore, github_issue_drafts_025_deployment_monitoring_alerting_monitoring, github_issue_drafts_026_deployment_credential_rotation_credential_rotation, github_issue_drafts_027_deployment_resend_sending_domain_resend_domain, github_issue_drafts_028_deployment_cron_variables_cron_variables [EXTRACTED 0.95]
- **Deferred / Not-Scheduled Issue Cluster (#029-#034)** — github_issue_drafts_029_deferred_multiple_report_photos_multiple_photos, github_issue_drafts_030_deferred_video_uploads_out_of_scope_video_uploads, github_issue_drafts_031_deferred_citizen_work_order_rollup_work_order_rollup, github_issue_drafts_032_deferred_export_audit_logging_export_audit_logging, github_issue_drafts_033_deferred_low_elevation_map_filter_low_elevation_filter, github_issue_drafts_034_deferred_barangay_insights_csv_export_barangay_csv_export [EXTRACTED 0.95]
- **Issue Tracking/Index Documentation Cluster** — github_issue_drafts_readme_index, github_issue_drafts_created_issues_tracker, github_issue_drafts_021_ci_verification_checklist_pre_pr_checklist, github_issue_drafts_022_deployment_runbook_runbook [EXTRACTED 0.90]

## Communities (189 total, 54 thin omitted)

### Community 0 - "Admin Layout & Map Controls"
Cohesion: 0.05
Nodes (79): AdminLayout(), MapMode, Office, OFFICE_OPTIONS, URGENCY_BANDS, AdminHeader(), pageLabel(), AdminSearch() (+71 more)

### Community 1 - "Admin/App Error Boundaries & Role Management"
Cohesion: 0.07
Nodes (48): ReactivateButton(), ROLE_LABELS, RoleOfficeEditor(), buildTicketExportParams(), buildUrlParams(), buildWorkOrderExportParams(), FilterState, initialFilterState() (+40 more)

### Community 2 - "Admin Playwright E2E Specs"
Cohesion: 0.06
Nodes (33): METRIC_LABELS, loginAdmin(), loginAdmin(), createOfficeNotification(), sessionCookieHeader(), ticketIdAsSystemAdmin(), authHeaders(), createThrowawayAdmin() (+25 more)

### Community 3 - "DB Migration Scripts"
Cohesion: 0.05
Nodes (8): client, db, main(), main(), main(), main(), admins, E2E_ADMIN_ACCOUNTS

### Community 4 - "Citizen Layout & Notification Center"
Cohesion: 0.06
Nodes (40): CitizenLayout(), buildParams(), formatDateTime(), NotificationCenterWorkspace(), handleOpen(), loadMore(), markAllRead(), markRead() (+32 more)

### Community 5 - "Moderation Service & Ticket Constants"
Cohesion: 0.06
Nodes (51): ModerationAction, ModerationFilters, ModerationQueueRow, ModerationStats, PaginatedModeration, DEFAULT_PAGE_LIMIT, FLAG_TYPES, FlagType (+43 more)

### Community 6 - "Admin Page Shells & Skeletons"
Cohesion: 0.09
Nodes (27): DashboardSkeleton(), DepartmentSkeleton(), DonutSkeleton(), MapPreset, MDRRMO_PRESETS, MEO_PRESETS, PresetGroup(), presetHref() (+19 more)

### Community 7 - "Root pnpm Scripts"
Cohesion: 0.04
Nodes (54): scripts, build, cleanup:e2e-admins, db:migrate, db:seed, format, import:barangays, import:city-boundary (+46 more)

### Community 8 - "Admin Audit Controller/Service"
Cohesion: 0.05
Nodes (33): AdminAuditController, Controller, Get, Query, UseGuards, ACTION_TYPES, AdminAuditActionType, AdminAuditActor (+25 more)

### Community 9 - "Distance Utils, Cron Controller & App Config"
Cohesion: 0.07
Nodes (28): haversineMeters(), TICKET_DISPUTE_REASON_MAX_LENGTH, PG, AppConfigService, Inject, Injectable, BarangayMatch, BarangayService (+20 more)

### Community 10 - "Barangay Geo & Dashboard Controllers"
Cohesion: 0.08
Nodes (24): BarangaysGeoService, Inject, Injectable, DashboardController, Controller, Get, Query, UseGuards (+16 more)

### Community 11 - "Activity Log Workspace UI"
Cohesion: 0.08
Nodes (32): ACTION_LABELS, ActivityLogWorkspace(), buildParams(), formatTime(), getPageNumbers(), initialQueryState(), PAGE_LIMITS, QueryState (+24 more)

### Community 12 - "Citizen Report Detail Page"
Cohesion: 0.08
Nodes (27): FALLBACK_STATUS_STYLE, MyReportDetailPage(), STATUS_STYLE, UrgencyBadge(), MyReportsPage(), CaseClosureSummary(), feedbackStateLine(), ReportImage() (+19 more)

### Community 13 - "Notifications Controller & Session Cookie"
Cohesion: 0.08
Nodes (21): SESSION_COOKIE, OLD_DATE, NotificationsController, makeAuthedController(), makeReq(), Controller, Get, HttpCode (+13 more)

### Community 14 - "Admin Controllers (Account/Audit/Directory/Insights/Moderation)"
Cohesion: 0.13
Nodes (19): PasswordBody, ACTIONS, Body, Controller, Get, Param, Patch, Post (+11 more)

### Community 15 - "Google OAuth Controller & Session"
Cohesion: 0.09
Nodes (22): JWKS, AccountErrorCode, LoginErrorCode, citizenSession, makeConfig(), makeController(), profile, OAuthProfile (+14 more)

### Community 16 - "Admin Sub-Pages (Account/Barangay/Flagged/Login)"
Cohesion: 0.09
Nodes (31): AdminAccountPage(), BarangayProfileFetch(), BarangayInsightsData(), Barangay, BarangaysGeoFeature, FlaggedData(), AdminLoginPage(), AdminMapPage() (+23 more)

### Community 17 - "Admin Map Client (MapClient.tsx)"
Cohesion: 0.07
Nodes (33): BarangayBoundaries(), CITY_CENTER, MapClient(), MapMode, matchesFilters(), useIsMobile(), MapClient, MapClientLoader() (+25 more)

### Community 18 - "Flagged Reports Workspace UI"
Cohesion: 0.07
Nodes (29): FlagBadge(), Barangay, formatDate(), PendingAction, QueryState, ReportCard(), ReportRow(), STATUS_BADGE_CLASS (+21 more)

### Community 19 - "Auth/Session/Ticket Service Specs"
Cohesion: 0.08
Nodes (17): MDRRMO_SUPERVISOR, MEO_OFFICER, SYSTEM_ADMIN, adminPayload, chain(), citizenPayload, makeSessionService(), createEmailService() (+9 more)

### Community 20 - "Tickets Controller (advance/detail/geo/moderate)"
Cohesion: 0.09
Nodes (16): values(), Body, Param, Post, TicketsController, Body, Controller, Get (+8 more)

### Community 21 - "Work Orders Service"
Cohesion: 0.07
Nodes (24): ACTIVE_TICKET_STATUSES, actorFrom(), HighUrgencyTicketWithOpenWork, OPEN_WORK_ORDER_STATUSES, PAGE_LIMITS, PaginatedWorkOrders, SAFE_COLUMNS, MDRRMO_SUPERVISOR (+16 more)

### Community 22 - "Hazard Urgency Triage Formula (rationale)"
Cohesion: 0.07
Nodes (39): ageFactor, Scoring model change-control rule, citizen_severity, clusterFactor, elevationFactor, environmentalUrgencyScore (dead output), High-urgency escalation notification (ticket_critical), precipitationFactor (+31 more)

### Community 23 - "Ticket Queue Workspace & Status Pills"
Cohesion: 0.08
Nodes (27): BarangayProfile(), formatDate(), formatElevation(), FALLBACK_STATUS_STYLE, StatusPill(), TICKET_STATUS_STYLE, Barangay, buildParams() (+19 more)

### Community 24 - "API Runtime Dependencies (NestJS/Drizzle/Cloudinary)"
Cohesion: 0.05
Nodes (37): dependencies, bcryptjs, cloudinary, cookie-parser, drizzle-orm, exifr, geotiff, jose (+29 more)

### Community 25 - "Password Reset Controller"
Cohesion: 0.10
Nodes (19): ForgotPasswordBody, getClientIp(), PasswordResetController, ResetPasswordBody, Body, Controller, Get, HttpCode (+11 more)

### Community 26 - "Auth Controller & Admin Cookie Util"
Cohesion: 0.10
Nodes (17): ADMIN_SESSION_MAX_AGE_MS, adminCookieOptions(), AuthController, LoginBody, SignupBody, adminSession, citizenSession, Body (+9 more)

### Community 27 - "Citizen Session Guard/Decorator"
Cohesion: 0.11
Nodes (18): CitizenSession, Get, CurrentCitizen, CitizenSessionGuard, RequestWithCitizen, Injectable, getClientIp(), ReportsController (+10 more)

### Community 28 - "Admin Account Controller (Password Change)"
Cohesion: 0.09
Nodes (19): AdminAccountController, actor, Body, Controller, HttpCode, Post, Res, UseGuards (+11 more)

### Community 29 - "Admin Directory/Admins Controller"
Cohesion: 0.09
Nodes (18): AdminDirectoryController, Controller, Get, Query, UseGuards, AdminsController, Body, Controller (+10 more)

### Community 30 - "Citizen Report Submission Form"
Cohesion: 0.09
Nodes (23): ReportForm, BarangayFeature, CITY_CENTER, ExifStatus, featureContainsPoint(), findBarangay(), getBarangayName(), getFeatureCentroid() (+15 more)

### Community 31 - "Admin Dashboard Client (Charts)"
Cohesion: 0.09
Nodes (25): ACTIVE_STATUS_ORDER, chartKey(), DashboardClient(), DashboardData, DEPARTMENT_ORDER, departmentChartConfig, departmentItems(), distributionItems() (+17 more)

### Community 32 - "Barangay Insights Controller/Service"
Cohesion: 0.08
Nodes (21): BarangayInsightsController, parseOfficeParam(), Controller, Get, Param, Query, UseGuards, BarangayCategoryRow (+13 more)

### Community 33 - "Citizen Account Controller & Cookie Util"
Cohesion: 0.12
Nodes (18): CITIZEN_REAUTH_MAX_AGE_MS, CITIZEN_SESSION_MAX_AGE_MS, citizenCookieOptions(), PasswordBody, ReauthBody, citizen, AccountService, FinalLoginMethodError (+10 more)

### Community 34 - "Google OAuth Provider & Controller"
Cohesion: 0.13
Nodes (11): GoogleOAuthProvider, Injectable, OAuthController, Controller, Get, Query, Req, Res (+3 more)

### Community 35 - "Root tsconfig.json"
Cohesion: 0.07
Nodes (29): api, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+21 more)

### Community 36 - "Session Service (sign/verify)"
Cohesion: 0.10
Nodes (16): Inject, SessionService, Inject, Injectable, AccountController, Body, Controller, HttpCode (+8 more)

### Community 37 - "Ticket/Location Map Components"
Cohesion: 0.12
Nodes (19): LegendBody(), TicketLocationMap(), TicketLocationMap, TicketLocationMapLoader(), LocationPreviewMap, LocationPreviewMapLoader(), CITY_CENTER, MapLegend() (+11 more)

### Community 38 - "Root devDependencies (lint/test tooling)"
Cohesion: 0.07
Nodes (29): eslint-config-next, devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, tsx (+21 more)

### Community 39 - "GIS Seed Scripts (barangays/city-boundary/DEM)"
Cohesion: 0.10
Nodes (15): Feature, main(), ring(), wkt(), Feature, main(), ring(), wkt() (+7 more)

### Community 40 - "Category Routing & Media/EXIF Service"
Cohesion: 0.08
Nodes (11): categoryRouting, officeForCategory(), ROUTING_BY_CATEGORY, UNKNOWN_CATEGORY_ROUTING, ReportInput, ExifResult, MediaService, RawExif (+3 more)

### Community 41 - "Citizen Sub-Pages (Dashboard/Map/Reports/Unauthorized)"
Cohesion: 0.13
Nodes (13): CitizenPublicMapPage(), CitizenUnauthorized(), REPORT_STATUS_FALLBACK, REPORT_STATUS_STYLE, StatTile(), PublicMapClient, PublicMapClientLoader(), FALLBACK_STATUS_STYLE (+5 more)

### Community 42 - "Database Reference Doc & Tables"
Cohesion: 0.10
Nodes (27): PORAC-SDSS API README, Database Reference Doc, admin_audit_events Table, admin_login_rate_limit_events Table, citizen_audit_events Table, citizen_identities Table, citizens Table, config Table (+19 more)

### Community 43 - "Admin Auth Service & Email Normalization"
Cohesion: 0.11
Nodes (7): normalizeEmail(), citizens, RateLimitCleanupResult, RateLimitResult, RateLimitService, Inject, Injectable

### Community 44 - "NestJS Feature Modules"
Cohesion: 0.14
Nodes (18): AdminModule, Module, AppModule, Module, AuthModule, Module, CitizensModule, Module (+10 more)

### Community 45 - "Drizzle Schema (audit/rate-limit/enums)"
Cohesion: 0.09
Nodes (23): CitizenAuditEventType, adminAuditEvents, adminLoginRateLimitEvents, adminRoleEnum, citizenAuditEvents, citizenIdentities, notificationRecipientTypeEnum, notifications (+15 more)

### Community 46 - "Ticket Detail Page (status/evidence/timeline)"
Cohesion: 0.10
Nodes (15): ACTIVE_STATUSES, DECOMPOSITION_SEGMENTS, NEXT_STATUS, TicketDetailData(), TimelineEntry, AssignmentPanel(), ReferralPanel(), RejectTicketPanel() (+7 more)

### Community 47 - "Admin Reports Service (CSV Export)"
Cohesion: 0.13
Nodes (13): isOverdue(), parseDateParam(), ReportDateRange, ReportsService, MEO_OFFICER, Injectable, TicketsService, Injectable (+5 more)

### Community 48 - "Frontend UI Dependencies (leaflet/lucide/cmdk)"
Cohesion: 0.08
Nodes (25): browser-image-compression, class-variance-authority, cmdk, leaflet, leaflet.markercluster, lucide-react, next, dependencies (+17 more)

### Community 49 - "Admin Command Palette (AdminSearch)"
Cohesion: 0.14
Nodes (21): AdminSearchItem, AdminSearchSection, Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem() (+13 more)

### Community 50 - "EXIF Util & Report Seed Scripts"
Cohesion: 0.14
Nodes (16): ExifResult, extractExif(), main(), points, citizens, main(), Severity, Spec (+8 more)

### Community 51 - "API tsconfig.json"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+14 more)

### Community 52 - "shadcn components.json Config"
Cohesion: 0.09
Nodes (22): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+14 more)

### Community 53 - "Dashboard Distribution Charts"
Cohesion: 0.19
Nodes (16): CategoryBreakdownList(), DepartmentWorkloadComparison(), DistributionChartItem, distributionDescription(), DistributionLegend(), formatDistributionPercent(), NormalizedDistributionItem, normalizeDistribution() (+8 more)

### Community 54 - "API package.json (Jest config)"
Cohesion: 0.09
Nodes (21): author, description, jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment (+13 more)

### Community 55 - "Activity Log & Admin Management Pages"
Cohesion: 0.12
Nodes (12): AdminManagementData(), ActivityLogSkeleton(), AdminManagementSkeleton(), AdminManagementWorkspace(), formatCreatedDate(), AdminAccountRow, AdminOffice, AdminRole (+4 more)

### Community 56 - "Citizen Auth Pages (Login/Signup/Forgot-Password)"
Cohesion: 0.14
Nodes (11): DashboardPage(), ForgotPasswordPage(), CitizenLoginPage(), CitizenSignupPage(), authNoticeMessage(), NOTICES, LoginForm(), MESSAGES (+3 more)

### Community 57 - "Features Doc (Admin/Citizen Flows)"
Cohesion: 0.09
Nodes (22): CSV Exports Reuse List Endpoint Filter Parsing, Features Doc, Admin Dashboard, Barangay Insights Feature, Barangay Resolution Flow, Case Closure and Resolution Feedback, Citizen Report Submission Flow, Flagged Reports (/admin/flagged) (+14 more)

### Community 58 - "shadcn CLI Reference (init/add/search/view)"
Cohesion: 0.13
Nodes (21): apply Command, shadcn CLI Reference, docs Command, info Command, init Command, search Command, Templates Table, view Command (+13 more)

### Community 59 - "shadcn Theming & Customization"
Cohesion: 0.11
Nodes (20): Adding Custom Colors, Border Radius (--radius), Color Variables (name/name-foreground, OKLCH), CSS Variables -> Tailwind Utilities -> Components, Customization & Theming, Customizing Components (variants/className/cva/wrapper), Dark Mode (class-based, next-themes), Built-in Variants First (+12 more)

### Community 60 - "Elevation/Weather/Recompute Services & Scoring"
Cohesion: 0.17
Nodes (14): getElevationBounds(), getCurrentRain1hMm(), recomputeActiveTicketUrgency(), exif, main(), CitizenSeverity, clamp01(), computePriorityBreakdown() (+6 more)

### Community 61 - "Cron Controller (recompute/cleanup/escalation)"
Cohesion: 0.13
Nodes (7): CronController, Controller, Post, UseGuards, EscalationService, Inject, Injectable

### Community 62 - "Admin Dashboard & Reports Pages"
Cohesion: 0.22
Nodes (14): DashboardResponse, DashboardSummary, DashboardError(), BarangayRiskRow, CategoryDistributionRow, DashboardKpis, DashboardRange, DistributionRow (+6 more)

### Community 63 - "Email Templates & Resend Service"
Cohesion: 0.23
Nodes (10): escapeHtml(), layout(), oauthOnlyNoticeEmailHtml(), passwordResetConfirmationEmailHtml(), passwordResetEmailHtml(), reportRejectedEmailHtml(), reportResolvedEmailHtml(), maskEmail() (+2 more)

### Community 64 - "Barangay Trend Chart & shadcn Chart Primitive"
Cohesion: 0.15
Nodes (14): BarangayTrendChart(), formatLongDate(), trendChartConfig, TrendTooltip(), ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent() (+6 more)

### Community 65 - "Test DB Isolation Spike Doc"
Cohesion: 0.15
Nodes (17): API pnpm-workspace.yaml, Spike: Per-Run Test Database Isolation, CI-Only Isolation Middle Path Recommendation, Database-per-run (Template Clone) Approach, Ephemeral PostGIS Container (CI) Approach, Schema-per-run Approach, Transaction Rollback Per Test Approach, Testing Reference Doc (+9 more)

### Community 66 - "Hazard Urgency Badge UI Utils"
Cohesion: 0.15
Nodes (13): AdminTicketRow, FALLBACK_STYLE, URGENCY_BADGE_CONFIG, URGENCY_BAND_STYLE, UrgencyBadgeConfig, UrgencyBand, UrgencyBandStyle, CLUSTER_TEST_BASE (+5 more)

### Community 67 - "Deployment Backlog Issue Docs (#71-78)"
Cohesion: 0.35
Nodes (16): Pre-PR Verification Checklist (Issue #71), Production Deployment Runbook (Issue #72), PostGIS Production Database Setup (Issue #73), Backup and Restore Verification Checklist (Issue #74), Monitoring and Alerting Checklist (Issue #75), Credential Rotation Checklist (Issue #76), Verify Resend Sending Domain Setup (Issue #77), Set and Verify GitHub Actions Cron Variables (Issue #78) (+8 more)

### Community 68 - "App Controller/Service (health check)"
Cohesion: 0.22
Nodes (7): AppController, Controller, Get, AppService, Inject, Injectable, HealthResponse

### Community 69 - "Security Hardening Plan Doc (R2/R3/R8/R10)"
Cohesion: 0.16
Nodes (15): Security Readiness Checklist, Citizen Cross-Account Report Access Regression Test (R8), Free-Text Length Bounds (R3), Baseline HTTP Security Response Headers (R2), Root and Admin SSR/API Error Boundaries (R10), Security Hardening Plan Doc, R10: Admin SSR Error Boundary, R2: Admin Console Clickjacking (Security Headers) (+7 more)

### Community 70 - "Session Verify Helpers (Next.js lightweight)"
Cohesion: 0.21
Nodes (11): MeResponse, CITIZEN_SESSION_COOKIE, CitizenSession, secret, verifyCitizenSession(), AdminSession, secret, SESSION_COOKIE (+3 more)

### Community 71 - "Barangay Insights Page & Types"
Cohesion: 0.15
Nodes (9): BarangayInsightsWorkspace(), formatDate(), BarangayElevationSummary, BarangayInsightKpis, BarangayInsightRow, BarangayInsightsResponse, BarangayProfile, BarangayRecentTicketRow (+1 more)

### Community 73 - "shadcn Base-vs-Radix Rules"
Cohesion: 0.15
Nodes (13): Accordion API differences (base vs radix), asChild (radix) vs render (base), Base vs Radix, nativeButton={false} (base non-button trigger), Select API differences (base vs radix), Slider API differences (base vs radix), data-icon Attribute (Button icons), Icons (+5 more)

### Community 74 - "shadcn Component Composition Rules"
Cohesion: 0.15
Nodes (13): Alert Component (callouts), Avatar Always Needs AvatarFallback, Button Loading Pattern (Spinner + data-icon + disabled), Card Structure (full composition), Component Composition, Dialog/Sheet/Drawer Require a Title, Empty Component (empty states), Use Existing Components Instead of Custom Markup (+5 more)

### Community 75 - "API tsconfig.build.json"
Cohesion: 0.15
Nodes (12): compilerOptions, rootDir, exclude, extends, node_modules, dist, drizzle, drizzle.config.ts (+4 more)

### Community 76 - "Triage Model Doc (Dedup/Scoring Formulas)"
Cohesion: 0.21
Nodes (13): Report to Ticket Separation, Urgency Triage Formula, Duplicate Detection and Merging, Urgency Scoring Formula, pg_advisory_xact_lock Concurrency Fix, Category-Specific Dedup Radius Table, Cluster Density Formula (Log-Scaled), Deduplication Engine (§6) (+5 more)

### Community 77 - "Terminology Doc & Manuscript-Alignment Phases 2-6"
Cohesion: 0.18
Nodes (13): Severity vs Urgency vs Priority Terminology, Urgency Ramp (Low/Medium/Critical Colors), reports Table, status_history Table, tickets Table, Manuscript Alignment Phase 2 (Urgency/Priority Unification), Manuscript Alignment Phase 3, Manuscript Alignment Phase 3 Follow-up (Category List) (+5 more)

### Community 78 - "Barangay Resolution & GADM-to-PSGC Migration"
Cohesion: 0.24
Nodes (12): Barangay Resolution (Two-Stage), Fraud/Integrity Flags, Municipality Config Value, barangays Table, city_boundary_osm Table, Integrity Flags Table, Migration Log: GADM to PSGC, swap-barangays-to-psgc.ts Script (+4 more)

### Community 79 - "shadcn Registry Authoring"
Cohesion: 0.20
Nodes (11): build Command, Address Schemes, Build and Verify, GitHub Registries, Include (modular registries), Item Definitions (registry item fields), Registry Mental Model (source vs built), Registry Authoring and Addresses (+3 more)

### Community 80 - "shadcn MCP Server Tools"
Cohesion: 0.18
Nodes (11): Configuring Registries (components.json registries field), shadcn:get_add_command_for_items Tool, shadcn:get_audit_checklist Tool, shadcn:get_item_examples_from_registries Tool, shadcn:get_project_registries Tool, shadcn:list_items_in_registries Tool, shadcn MCP Server, shadcn:search_items_in_registries Tool (+3 more)

### Community 81 - "shadcn Chat & Messaging Components"
Cohesion: 0.18
Nodes (11): Attachment Component, Bubble Component, Chat & Messaging, Marker Component, Message Component, MessageScroller Component, Scroller Hooks (useMessageScroller etc.), Streaming/Anchoring/Jump-to-latest (built-in) (+3 more)

### Community 82 - "Citizen Account Security Panel"
Cohesion: 0.25
Nodes (6): AccountPage(), AccountSecurityPanel(), ERROR_MESSAGES, Provider, PROVIDER_LABEL, SecurityStatus

### Community 83 - "Project Status Doc & Repo-Owned Skills"
Cohesion: 0.25
Nodes (11): Repo Layout (Two-App Monorepo), Two ORMs by Column Type, PORAC-SDSS Repo-Owned Skills, office_reassignments Table, Project Status Doc, Do Not Build Yet Rules (§6), Risks to Avoid (§7), Build Log / Deviations from Plan (§16) (+3 more)

### Community 84 - "Security Model Doc (Auth/RBAC/Sessions)"
Cohesion: 0.20
Nodes (11): Two Auth Systems (Admin/Citizen), admins Table, Audience Model (Citizen/Office Admin/System Admin), Ticket Reassignment Security Tests Added, Work-Order Office-Scoping Test Gaps Closed, Security Model Doc, Guards Table (AdminSessionGuard etc), Office Scoping (resolveOfficeScope/assertOfficeAccess) (+3 more)

### Community 85 - "Deployment Readiness Doc & Cron Jobs"
Cohesion: 0.20
Nodes (11): notifications Table, Deployment Readiness Doc, Production Environment Variables Concerns, Monitoring and Operations Gap, Scheduled Cron Jobs Table, Scheduled Jobs (Cron), Current Queue (§4), Ticket Escalation Notifications Feature (+3 more)

### Community 86 - "Build-Recovery Verification Script"
Cohesion: 0.20
Nodes (7): apiRoot, buildInfo, distDir, distMain, { execSync }, { existsSync, rmSync }, { join }

### Community 87 - "Moderation Controller"
Cohesion: 0.24
Nodes (5): ModerationController, Controller, Get, Query, UseGuards

### Community 88 - "Reports Controller (CSV Export)"
Cohesion: 0.29
Nodes (7): csvFilename(), ReportsController, Controller, Get, Query, Res, UseGuards

### Community 89 - "Email Service Interface"
Cohesion: 0.20
Nodes (3): Inject, EmailService, Inject

### Community 90 - "Moderation Queue UI Components"
Cohesion: 0.24
Nodes (7): ReportCard(), ModerationStatusBadge(), ReportDetail(), FLAG_TYPE_LABELS, flagEvidence(), flagLabel(), moderationStatusLabel()

### Community 91 - "Admin Management Dialogs (Create/Deactivate/Reset)"
Cohesion: 0.27
Nodes (8): CreateAdminDialog(), handleSubmit(), resetAndClose(), DeactivateDialog(), handleConfirm(), resetAndClose(), emptyDraft(), ResetPasswordDialog()

### Community 92 - "PLAN.md Design Migration Phases"
Cohesion: 0.24
Nodes (10): Design Migration Phases 0-6, Prototype Realignment Plan, Core Decision: Migrate Database, Amend Frontend (§3), Data Pipeline: GeoJSON and GeoTIFF (§4), Downstream Flow Mapping (Removed/Rework Option), Gap Matrix: Paper vs Repository (§2), LGU Office Separation (§10), Open Questions for the Group (§15) (+2 more)

### Community 93 - "shadcn Forms & Inputs Rules"
Cohesion: 0.22
Nodes (9): ToggleGroup API differences (base vs radix), Field Validation and Disabled States, FieldGroup + Field Pattern, FieldSet + FieldLegend Grouping, Forms & Inputs, InputGroup (InputGroupInput/InputGroupTextarea), InputGroupAddon (buttons inside inputs), ToggleGroup for Option Sets (2-7 choices) (+1 more)

### Community 94 - "API devDependencies (types/eslint-plugin)"
Cohesion: 0.22
Nodes (9): devDependencies, eslint-plugin-prettier, @types/express, @types/node, @types/supertest, @types/node, eslint-plugin-prettier, @types/express (+1 more)

### Community 95 - "Admin Ticket Types (Detail/Reassignment/Referral)"
Cohesion: 0.36
Nodes (8): TicketDetailResponse, TicketDetail, TicketPriorityContext, TicketReassignmentRow, TicketReferralRow, TicketReport, TicketStatusHistoryRow, PriorityBreakdown

### Community 96 - "Work Orders Feature (Table/Docs)"
Cohesion: 0.29
Nodes (8): Work Orders as Fourth Independent Status Track, work_orders Table, Work Orders Feature, Office-Scoped Admin Directory Feature, My Assignments Work Order Filter Feature, Office Performance Summary Feature, Office Work Orders Feature (Shipped), Data Separation and Privacy (§7)

### Community 97 - "Flagged Workspace Query Helpers"
Cohesion: 0.25
Nodes (4): buildParams(), FlaggedWorkspace(), getPageNumbers(), initialQueryState()

### Community 98 - "Design System v3 & Product Principles"
Cohesion: 0.32
Nodes (8): Design Anti-Patterns (Explicit Bans), Deep Municipal Navy Sidebar, One Meaning Per Color Channel Rule, Token Override Architecture (data-shell), v2 Dark Admin Shell (Reverted), PORAC-SDSS Design System v3, Porac SDSS Product Definition, Product Design Principles

### Community 99 - "useKeypress Hook"
Cohesion: 0.39
Nodes (7): IGNORE_FOCUS, isMod(), matches(), MODS, normalize(), useKeypress(), UseKeypressOptions

### Community 100 - "shadcn add/diff Commands & Presets"
Cohesion: 0.33
Nodes (7): add Command, diff Command (deprecated, use add --diff), Dry-Run Mode (--dry-run/--diff/--view), Presets (named/code/URL), Switching Presets (cli.md), Checking for Updates, Updating Components (smart merge)

### Community 101 - "API nest-cli.json"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, deleteOutDir, tsConfigPath, $schema, sourceRoot

### Community 102 - "Urgency Domain Logic (computeUrgency)"
Cohesion: 0.43
Nodes (5): computeUrgency(), URGENCY_LEVEL_TO_BAND, UrgencyBand, UrgencyFactors, urgencyLevelFromScore()

### Community 103 - "Root package.json"
Cohesion: 0.29
Nodes (6): engines, node, name, packageManager, private, version

### Community 104 - "API package.json Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, gis:generate-boundary, lint, start, test:e2e

### Community 105 - "GIS Boundary Generator Script"
Cohesion: 0.38
Nodes (6): barangaysPath, countInteriorRings(), countPolygonParts(), main(), outputPath, PolygonFeature

### Community 106 - "piexifjs Type Declarations"
Cohesion: 0.29
Nodes (4): ExifData, ExifValue, Piexif, piexifjs

### Community 107 - "Drizzle DbModule"
Cohesion: 0.33
Nodes (4): DbModule, Inject, Module, Global

### Community 108 - "clean-build-cache.js Script"
Cohesion: 0.40
Nodes (4): apiRoot, { join }, { rmSync, existsSync }, targets

### Community 109 - "Operational Priority UI Utils"
Cohesion: 0.50
Nodes (4): clamp01(), ScoringTab(), priorityBandClass(), priorityBandLabel()

### Community 110 - "Root App Layout (Fonts/Metadata)"
Cohesion: 0.40
Nodes (3): geistMono, interSans, metadata

### Community 111 - "Horizontal Status Tracker Component"
Cohesion: 0.67
Nodes (4): formatTimestamp(), HorizontalStatusTracker(), advanceStatus(), handleAdvanceClick()

### Community 112 - "Create Work Order Dialog"
Cohesion: 0.83
Nodes (4): CreateWorkOrderDialog(), handleSubmit(), resetAndClose(), emptyDraft()

### Community 114 - "Admin Account Security Panel (duplicate)"
Cohesion: 1.00
Nodes (3): AdminAccountSecurityPanel(), handleSubmit(), emptyDraft()

### Community 117 - "Security Issues: Login Throttling/Audit/Trust Proxy"
Cohesion: 0.67
Nodes (3): Failed-Login Throttling for Admin Login, Admin Login Audit Events, Trust Proxy Behavior Review (deployment-gated)

### Community 118 - "Reliability Issues: Free-Text Bounds/Email/Env Validation"
Cohesion: 0.67
Nodes (3): Max-Length Bounds for Free-Text Fields, Resend/Email Failure Visibility in Development, Clearer API Startup Env-Validation Messages

### Community 119 - "Testing Issues: DB Isolation/CI/Job Summary"
Cohesion: 0.67
Nodes (3): Per-Run Test Database Isolation Spike, Add Playwright to CI (blocked by DB isolation), CI Job Summary for Build and Test Results

## Knowledge Gaps
- **716 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `tsConfigPath` (+711 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **54 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `client` connect `DB Migration Scripts` to `GIS Seed Scripts (barangays/city-boundary/DEM)`, `Citizen Account Security Migration Script`, `Citizen Identities Migration Script`, `Moderation Migration Script`, `EXIF Util & Report Seed Scripts`, `Elevation/Weather/Recompute Services & Scoring`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `MUNICIPALITY` connect `GIS Seed Scripts (barangays/city-boundary/DEM)` to `Ticket/Location Map Components`, `Admin Map Client (MapClient.tsx)`, `Citizen Auth Pages (Login/Signup/Forgot-Password)`, `Elevation/Weather/Recompute Services & Scoring`, `Citizen Report Submission Form`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `admins` connect `DB Migration Scripts` to `Admin Audit Controller/Service`, `Admin Auth Service & Email Normalization`, `Drizzle Schema (audit/rate-limit/enums)`, `Admin Controllers (Account/Audit/Directory/Insights/Moderation)`, `Work Orders Service`, `Admin Account Controller (Password Change)`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _716 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Layout & Map Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.048600883652430045 - nodes in this community are weakly interconnected._
- **Should `Admin/App Error Boundaries & Role Management` be split into smaller, more focused modules?**
  _Cohesion score 0.06511761331038439 - nodes in this community are weakly interconnected._
- **Should `Admin Playwright E2E Specs` be split into smaller, more focused modules?**
  _Cohesion score 0.06293706293706294 - nodes in this community are weakly interconnected._