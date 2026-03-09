# School Management System API

This project provides a Node.js + Express backend connected to your PostgreSQL database.

## 1) Setup

```bash
npm install
cp .env.example .env
```

Set `DATABASE_URL` in `.env` with your real connection string.

## 2) Run

```bash
npm run dev
```

Or run without auto-reload:

```bash
npm start
```

## Project Structure

```text
src/
	app.js
	index.js
	config/
		env.js
	db/
		pool.js
	docs/
		swagger.js
	queries/
		systemQueries.js
	controllers/
		systemController.js
		authController.js
		userController.js
	routes/
		systemRoutes.js
		authRoutes.js
		userRoutes.js
	utils/
		dbErrors.js
		schema.js
```

## 3) Available Endpoints

- `GET /health` - API health check
- `GET /db/health` - Database connectivity check
- `GET /tables` - List all public schema tables
- `GET /roles` - Fetch roles filtered by JWT caller role (requires `Authorization: Bearer <token>`)
- `GET /superadmin/schools` - SUPERADMIN-only endpoint to list schools with `school_name`, `school_code`, `owner`, `status`, and `created_by` (`Authorization: Bearer <token>`)
- `GET /superadmin/schools/:schoolCode/students/classwise` - SUPERADMIN-only endpoint to list students grouped class-wise for a school (`Authorization: Bearer <token>`)
- `GET /superadmin/schools/:schoolCode/teachers` - SUPERADMIN-only endpoint to list teacher details for a school (`Authorization: Bearer <token>`)
- `GET /superadmin/schools/:schoolCode/parents` - SUPERADMIN-only endpoint to list parent details for a school (`Authorization: Bearer <token>`)
- `GET /superadmin/schools/:schoolCode/owners-itadmin` - SUPERADMIN-only endpoint to list OWNER and ITADMIN users for a school with separate `owners` and `itadmins` arrays (`Authorization: Bearer <token>`)
- `GET /itadmin/users` - ITADMIN-only endpoint to list users for the school associated with caller token (`Authorization: Bearer <token>`). Returns only `name`, `email`, `phone`, `whatsapp`, and `role`
- `POST /school/validate-code` - Check if entered school code is valid
- `POST /auth/validate-login` - Check if entered login details (`email` and plain `password`) are valid for the entered school
- `POST /auth/superadmin/login` - SUPERADMIN-only login using `email` and `password` (no `schoolCode` required)
- `POST /auth/logout` - Logout current user and invalidate current JWT token
- `POST /users` - Add user with `schoolCode`, `name`, `email`, `phone`, and `role` (optional `status`, default `ACTIVE`). Backend stores `school_id`, `name`, `email`, `phone`, `status`, `role_id`, `password`, `created_by`; `role_id` is resolved from role name, a random password is generated automatically, and `created_by` is taken from token `userId`

On successful login, response includes a JWT `token` along with `userId` and `role`.

`/roles` filtering rules based on token `role`:

- `SUPERADMIN` -> returns only `OWNER`
- `OWNER` -> returns only `ITADMIN`
- `ITADMIN` -> returns `TEACHER`, `PARENT`, `STUDENT`
- Any other role -> returns empty list

## 4) Swagger

- Swagger UI: `http://localhost:<APP_PORT>/docs`
- OpenAPI JSON: `http://localhost:<APP_PORT>/docs.json`

## 5) Table Reference

Use these tables as the source for upcoming API modules:

- `academic_year`
- `assignments`
- `attendance`
- `class_subjects`
- `classes`
- `exam_marks`
- `exams`
- `notices`
- `parent_student`
- `parents`
- `roles1`
- `school`
- `sections`
- `student_enrollments`
- `students`
- `subjects`
- `teacher_assignments`
- `teachers`
- `timetable`
- `users`

## Security Note

Do not commit `.env` with real credentials. Rotate credentials if they were shared publicly.
