# Project Documentation

This directory contains the durable product, engineering, operations, and quality records for Arslan Transport 2.0. Run all documented commands from the repository root unless a guide says otherwise.

## Architecture

- [Product context](architecture/PRODUCT_CONTEXT.md) - product positioning, modules, scope, and MVP boundaries
- [Architecture decisions](architecture/DECISIONS.md) - confirmed technical and product decisions
- [Database schema](architecture/DATABASE_SCHEMA.md) - multi-tenant data model, security model, and financial storage strategy

## Development and operations

- [Environment setup](development/ENVIRONMENT_SETUP.md) - local modes, Supabase configuration, migrations, R2 setup, and troubleshooting

## Data imports

- [April 2026 master data](imports/IMPORT_APRIL_2026.md) - client, driver, and vehicle import procedure
- [April 2026 route locations](imports/IMPORT_APRIL_2026_ROUTES.md) - saved route-location import procedure
- [April 2026 shipments](imports/IMPORT_APRIL_2026_SHIPMENTS.md) - shipment import, validation, and verification procedure

Import procedures are operational runbooks. Review their environment requirements, idempotency notes, and verification steps before executing any command.

## Product delivery

- [Roadmap](product/ROADMAP.md) - completed work, active modes, and recommended phases
- [UI V2 implementation](product/UI_V2_IMPLEMENTATION.md) - implemented surfaces, navigation mapping, and logic-parity record

## Quality and remediation

- [Logic audit and QA implementation plan](quality/LOGIC_AUDIT_QA_IMPLEMENTATION_PLAN.md) - financial and data-integrity assessment, remediation phases, and acceptance criteria
- [Logic remediation handoff](quality/LOGIC_REMEDIATION_HANDOFF.md) - deployment sequence, quality gates, and rollback boundary

## Documentation conventions

- Keep the root `README.md` concise and suitable as the GitHub repository landing page.
- Put detailed records in the closest category under `docs/`.
- Use repository-relative links so documentation works locally and on GitHub.
- Never place secrets, private credentials, or machine-specific absolute paths in documentation.
