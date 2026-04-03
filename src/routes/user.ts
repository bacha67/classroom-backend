import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects, user } from "../db/schema/index.js";
import { parsePagination, toBoolean, toOptionalTrimmedString, toTrimmedString } from "./_shared.js";

const router = express.Router();

type UserRole = "student" | "teacher" | "admin";

const parseUserRole = (value: unknown): UserRole | null => {
    if (value === "student" || value === "teacher" || value === "admin") {
        return value;
    }

    return null;
};

router.get("/", async (req, res) => {
    try {
        const { currentPage, limitPerPage, offset } = parsePagination(req);
        const search = toTrimmedString(req.query.search);
        const role = parseUserRole(req.query.role);

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
            );
        }

        if (role) {
            filterConditions.push(eq(user.role, role));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause);

        const data = await db
            .select(getTableColumns(user))
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: countResult[0]?.count ?? 0,
                totalPages: Math.ceil((countResult[0]?.count ?? 0) / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

router.post("/", async (req, res) => {
    try {
        const id = toTrimmedString(req.body.id);
        const name = toTrimmedString(req.body.name);
        const email = toTrimmedString(req.body.email);
        const role = parseUserRole(req.body.role) ?? "student";
        const emailVerified = toBoolean(req.body.emailVerified);
        const image = toOptionalTrimmedString(req.body.image);
        const imageCldPubId = toOptionalTrimmedString(req.body.imageCldPubId);

        if (!id || !name || !email || emailVerified === null) {
            return res.status(400).json({ error: "id, name, email, and emailVerified are required" });
        }

        const [existingUser] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, id));

        if (existingUser) {
            return res.status(409).json({ error: "User id already exists" });
        }

        const [createdUser] = await db
            .insert(user)
            .values({
                id,
                name,
                email,
                emailVerified,
                image,
                role,
                imageCldPubId,
            })
            .returning();

        res.status(201).json({ data: createdUser });
    } catch (error) {
        console.error("POST /users error:", error);
        res.status(500).json({ error: "Failed to create user" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const userId = toTrimmedString(req.params.id);

        if (!userId) {
            return res.status(400).json({ error: "Invalid user id" });
        }

        const [userRecord] = await db
            .select(getTableColumns(user))
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        const [totals] = await db
            .select({
                classes: sql<number>`count(distinct ${classes.id})`,
                enrollments: sql<number>`count(distinct ${enrollments.id})`,
            })
            .from(user)
            .leftJoin(classes, eq(classes.teacherId, user.id))
            .leftJoin(enrollments, eq(enrollments.studentId, user.id))
            .where(eq(user.id, userId));

        res.status(200).json({
            data: {
                user: userRecord,
                totals: {
                    classes: totals?.classes ?? 0,
                    enrollments: totals?.enrollments ?? 0,
                },
            },
        });
    } catch (error) {
        console.error("GET /users/:id error:", error);
        res.status(500).json({ error: "Failed to fetch user details" });
    }
});

router.get("/:id/subjects", async (req, res) => {
    try {
        const userId = toTrimmedString(req.params.id);

        if (!userId) {
            return res.status(400).json({ error: "Invalid user id" });
        }

        const { currentPage, limitPerPage, offset } = parsePagination(req);

        const [userRecord] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        if (userRecord.role !== "teacher" && userRecord.role !== "admin") {
            return res.status(200).json({
                data: [],
                pagination: {
                    page: currentPage,
                    limit: limitPerPage,
                    total: 0,
                    totalPages: 0,
                },
            });
        }

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(eq(classes.teacherId, userId));

        const data = await db
            .select({
                ...getTableColumns(subjects),
                department: {
                    id: departments.id,
                    name: departments.name,
                    code: departments.code,
                },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(classes.teacherId, userId))
            .orderBy(desc(subjects.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: countResult[0]?.count ?? 0,
                totalPages: Math.ceil((countResult[0]?.count ?? 0) / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /users/:id/subjects error:", error);
        res.status(500).json({ error: "Failed to fetch user subjects" });
    }
});

router.get("/:id/departments", async (req, res) => {
    try {
        const userId = toTrimmedString(req.params.id);

        if (!userId) {
            return res.status(400).json({ error: "Invalid user id" });
        }

        const { currentPage, limitPerPage, offset } = parsePagination(req);

        const [userRecord] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        if (userRecord.role !== "teacher" && userRecord.role !== "admin") {
            return res.status(200).json({
                data: [],
                pagination: {
                    page: currentPage,
                    limit: limitPerPage,
                    total: 0,
                    totalPages: 0,
                },
            });
        }

        const countResult = await db
            .select({ count: sql<number>`count(distinct ${departments.id})` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(classes.teacherId, userId));

        const data = await db
            .selectDistinct({
                ...getTableColumns(departments),
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(classes.teacherId, userId))
            .orderBy(desc(departments.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: countResult[0]?.count ?? 0,
                totalPages: Math.ceil((countResult[0]?.count ?? 0) / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /users/:id/departments error:", error);
        res.status(500).json({ error: "Failed to fetch user departments" });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const userId = toTrimmedString(req.params.id);

        if (!userId) {
            return res.status(400).json({ error: "Invalid user id" });
        }

        const name = toTrimmedString(req.body.name);
        const email = toTrimmedString(req.body.email);
        const role = parseUserRole(req.body.role);
        const emailVerified = toBoolean(req.body.emailVerified);
        const image = toOptionalTrimmedString(req.body.image);
        const imageCldPubId = toOptionalTrimmedString(req.body.imageCldPubId);

        if (!name || !email || !role || emailVerified === null) {
            return res.status(400).json({ error: "name, email, role, and emailVerified are required" });
        }

        const [existingUser] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId));

        if (!existingUser) {
            return res.status(404).json({ error: "User not found" });
        }

        const [updatedUser] = await db
            .update(user)
            .set({
                name,
                email,
                role,
                emailVerified,
                image,
                imageCldPubId,
            })
            .where(eq(user.id, userId))
            .returning();

        res.status(200).json({ data: updatedUser });
    } catch (error) {
        console.error("PUT /users/:id error:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const userId = toTrimmedString(req.params.id);

        if (!userId) {
            return res.status(400).json({ error: "Invalid user id" });
        }

        const [teachingClass] = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.teacherId, userId))
            .limit(1);

        if (teachingClass) {
            return res.status(409).json({ error: "User is assigned to classes and cannot be deleted" });
        }

        const [studentEnrollment] = await db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(eq(enrollments.studentId, userId))
            .limit(1);

        if (studentEnrollment) {
            return res.status(409).json({ error: "User has enrollments and cannot be deleted" });
        }

        const [deletedUser] = await db
            .delete(user)
            .where(eq(user.id, userId))
            .returning({ id: user.id });

        if (!deletedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: deletedUser });
    } catch (error) {
        console.error("DELETE /users/:id error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

export default router;
