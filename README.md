# School Management System API

This project provides a Node.js + Express backend connected to PostgreSQL.

## 1) Setup

```bash
npm install
cp .env.example .env
```

Set `DATABASE_URL` in `.env` with your connection string.

## 2) Run

```bash
npm run dev
```

Or run without auto reload:

```bash
npm start
```

## 3) Available Endpoints

- `GET /health` - API health check
- `GET /db/health` - Database connectivity check
- `GET /tables` - List all public schema tables
- `GET /roles` - Fetch roles filtered by JWT caller role (requires `Authorization: Bearer <token>`)
- `GET /superadmin/schools` - SUPERADMIN-only endpoint to list schools
- `POST /superadmin/schools` - SUPERADMIN-only endpoint to add school
- `POST /superadmin/schools/owner` - SUPERADMIN-only endpoint to add owner for school
- `GET /superadmin/schools/:schoolCode/students/classwise` - SUPERADMIN-only class-wise student count
- `GET /superadmin/schools/:schoolCode/teachers` - SUPERADMIN-only teacher details for a school
- `GET /superadmin/schools/:schoolCode/parents` - SUPERADMIN-only parent details for a school
- `GET /superadmin/schools/:schoolCode/owners-itadmin` - SUPERADMIN-only OWNER and ITADMIN details
- `GET /itadmin/users` - ITADMIN-only users list for caller school
- `POST /itadmin/classes` - ITADMIN-only add class with payload `{ "class_name": 10 }` (`created_by` from JWT `userId`)
- `GET /itadmin/classes-teachers` - ITADMIN-only classes and teachers list for caller school
- `PUT /itadmin/sections/:sectionId` - ITADMIN-only update section (`created_by` from JWT `userId`)
- `POST /itadmin/sections` - ITADMIN-only create section using `teacher_id`, `class_id`, `section_name` (`created_by` from JWT `userId`)
- `POST /school/validate-code` - Validate school code
- `POST /auth/validate-login` - Validate login against school
- `POST /auth/superadmin/login` - SUPERADMIN login
- `POST /auth/logout` - Logout and invalidate JWT token
- `POST /users` - Add user
- `GET /teacher/classes-assigned` -
  without query: TEACHER-only assigned classes/sections for logged-in teacher;
  with `school_ID` query: returns class list and teacher list for requested school
- `GET /teacher/sections/:sectionId/students` - TEACHER-only students for assigned section

## 4) Swagger

- Swagger UI: `http://localhost:<APP_PORT>/docs`
- OpenAPI JSON: `http://localhost:<APP_PORT>/docs.json`

## Security Note

Do not commit `.env` with real credentials. Rotate credentials if they were shared publicly.
