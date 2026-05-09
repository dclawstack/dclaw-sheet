# PRODUCT-SPEC: CRM

## Overview

**App Name:** CRM
**Domain:** Customer Relationship Management
**Target User:** Sales teams, account managers

## Core Entities

### Customer
```
Customer
├── id: UUID (PK)
├── name: str (required)
├── email: str (unique, required)
├── phone: str (optional)
├── company: str (optional)
├── status: enum ["lead", "active", "churned"] (default: "lead")
├── notes: str (optional)
├── created_at: datetime
└── updated_at: datetime
```

### Deal
```
Deal
├── id: UUID (PK)
├── customer_id: UUID (FK → Customer, ondelete=CASCADE)
├── title: str (required)
├── value: float (required, default 0)
├── stage: enum ["prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"] (default: "prospecting")
├── probability: int (0-100, default 0)
├── expected_close_date: date (optional)
├── created_at: datetime
└── updated_at: datetime
```

### Activity
```
Activity
├── id: UUID (PK)
├── deal_id: UUID (FK → Deal, ondelete=CASCADE, optional)
├── customer_id: UUID (FK → Customer, ondelete=CASCADE)
├── activity_type: enum ["call", "email", "meeting", "note"] (required)
├── description: str (required)
├── scheduled_at: datetime (optional)
├── completed: bool (default false)
├── created_at: datetime
└── updated_at: datetime
```

## User Stories / Screens

### Screen 1: Dashboard
- Summary cards: total customers, open deals, total pipeline value, win rate
- Recent activities feed
- Deals by stage bar chart
- Quick action buttons (add customer, add deal, log activity)

### Screen 2: Customers
- Table view with pagination, search by name/email/company
- Status filter (lead/active/churned)
- Bulk delete
- "Add Customer" modal/form

### Screen 3: Customer Detail
- Customer info card with edit/delete
- Related deals list
- Related activities timeline
- Add deal / add activity buttons

### Screen 4: Deals
- Kanban board view by stage (prospecting → closed_won/lost)
- Table view toggle
- Search and filter by customer, stage, value
- "Add Deal" form with customer dropdown

### Screen 5: Deal Detail
- Deal info with edit/delete
- Probability slider
- Related activities
- Move stage buttons

### Screen 6: Activities
- Timeline view of all activities
- Filter by type, customer, deal
- Mark complete / incomplete

## AI Features

- **Deal sentiment analysis:** Analyze customer emails/notes for positive/negative sentiment
- **Next best action:** Recommend next activity based on deal stage and last contact
- **Win probability prediction:** Use deal attributes to suggest probability score

## API Endpoints (v1.0)

```
GET    /api/v1/customers          → List customers
POST   /api/v1/customers          → Create customer
GET    /api/v1/customers/{id}     → Get customer
PUT    /api/v1/customers/{id}     → Update customer
DELETE /api/v1/customers/{id}     → Delete customer
GET    /api/v1/deals              → List deals
POST   /api/v1/deals              → Create deal
GET    /api/v1/deals/{id}         → Get deal
PUT    /api/v1/deals/{id}         → Update deal
DELETE /api/v1/deals/{id}         → Delete deal
GET    /api/v1/activities         → List activities
POST   /api/v1/activities         → Create activity
GET    /api/v1/activities/{id}    → Get activity
PUT    /api/v1/activities/{id}    → Update activity
DELETE /api/v1/activities/{id}    → Delete activity
GET    /api/v1/dashboard          → Dashboard stats
```

## Non-Functional Requirements

- Backend tests: 70%+ coverage
- Frontend: Responsive, Tailwind + shadcn/ui
- Docker: All services start with `docker compose up -d`
- No mock data — everything persisted to PostgreSQL
