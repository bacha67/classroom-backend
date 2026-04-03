import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, enrollments, subjects, user } from "../db/schema/index.js";
import { parseNumericId, toOptionalTrimmedString, toTrimmedString } from "./_shared.js";

const router = express.Router();

type ClassStatus = "active" | "inactive" | "archived";

const parseSchedules = (value: unknown) => {
    if (!Array.isArray(value)) {
        return null;
    }

    return value;
};

const generateInviteCode = () =>
    `CLS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const parseClassStatus = (value: unknown): ClassStatus | null => {
    if (value === "active" || value === "inactive" || value === "archived") {
        return value;
    }

    return null;
};

router.get("/", async (req, res) => {
    try {
        const { search, subject, teacher, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        if (subject) {
            filterConditions.push(ilike(subjects.name, `%${subject}%`));
        }

        if (teacher) {
            filterConditions.push(ilike(user.name, `%${teacher}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /classes error:", error);
        res.status(500).json({ error: "Failed to fetch classes" });
    }
});

router.post("/", async (req, res) => {
    try {
        const subjectId = parseNumericId(req.body.subjectId);
        const teacherId = toTrimmedString(req.body.teacherId);
        const inviteCode = toTrimmedString(req.body.inviteCode) ?? generateInviteCode();
        const name = toTrimmedString(req.body.name);
        const description = toOptionalTrimmedString(req.body.description);
        const bannerUrl = toOptionalTrimmedString(req.body.bannerUrl);
        const bannerCldPubId = toOptionalTrimmedString(req.body.bannerCldPubId);
        const schedules = parseSchedules(req.body.schedules) ?? [];
        const status = parseClassStatus(req.body.status) ?? "active";
        const capacity = Number(req.body.capacity ?? 50);

        if (!subjectId || !teacherId || !name) {
            return res.status(400).json({
                error: "subjectId, teacherId, and name are required",
            });
        }

        if (!Number.isFinite(capacity) || capacity <= 0) {
            return res.status(400).json({ error: "capacity must be a positive number" });
        }

        const [subject] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.id, subjectId));

        if (!subject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        const [teacher] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, teacherId));

        if (!teacher) {
            return res.status(404).json({ error: "Teacher not found" });
        }

        if (teacher.role !== "teacher" && teacher.role !== "admin") {
            return res.status(400).json({ error: "teacherId must belong to a teacher or admin user" });
        }

        const [duplicateClass] = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.inviteCode, inviteCode));

        if (duplicateClass) {
            return res.status(409).json({ error: "Class invite code already exists" });
        }

        const [createdClass] = await db
            .insert(classes)
            .values({
                subjectId,
                teacherId,
                inviteCode,
                name,
                description,
                bannerUrl,
                bannerCldPubId,
                capacity: Math.floor(capacity),
                status,
                schedules,
            })
            .returning();

        res.status(201).json({ data: createdClass });
    } catch (error) {
        console.error("POST /classes error:", error);
        res.status(500).json({ error: "Failed to create class" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const classId = parseNumericId(req.params.id);

        if (!classId) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const [classRecord] = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    image: user.image,
                },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(eq(classes.id, classId));

        if (!classRecord) {
            return res.status(404).json({ error: "Class not found" });
        }

        const [enrollmentTotals] = await db
            .select({ enrollments: sql<number>`count(*)` })
            .from(enrollments)
            .where(eq(enrollments.classId, classId));

        res.status(200).json({
            data: {
                class: classRecord,
                totals: {
                    enrollments: enrollmentTotals?.enrollments ?? 0,
                },
            },
        });
    } catch (error) {
        console.error("GET /classes/:id error:", error);
        res.status(500).json({ error: "Failed to fetch class details" });
    }
});

router.get("/:id/students", async (req, res) => {
    try {
        const classId = parseNumericId(req.params.id);

        if (!classId) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const { currentPage, limitPerPage, offset } = parsePagination(req);

        const [classRecord] = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!classRecord) {
            return res.status(404).json({ error: "Class not found" });
        }

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(enrollments)
            .where(eq(enrollments.classId, classId));

        const data = await db
            .select({
                enrollmentId: enrollments.id,
                student: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    image: user.image,
                },
                createdAt: enrollments.createdAt,
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .where(eq(enrollments.classId, classId))
            .orderBy(desc(enrollments.createdAt))
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
        console.error("GET /classes/:id/students error:", error);
        res.status(500).json({ error: "Failed to fetch class students" });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const classId = parseNumericId(req.params.id);

        if (!classId) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const subjectId = parseNumericId(req.body.subjectId);
        const teacherId = toTrimmedString(req.body.teacherId);
        const inviteCode = toTrimmedString(req.body.inviteCode);
        const name = toTrimmedString(req.body.name);
        const description = toOptionalTrimmedString(req.body.description);
        const bannerUrl = toOptionalTrimmedString(req.body.bannerUrl);
        const bannerCldPubId = toOptionalTrimmedString(req.body.bannerCldPubId);
        const schedules = parseSchedules(req.body.schedules) ?? [];
        const status = parseClassStatus(req.body.status);
        const capacity = Number(req.body.capacity);

        if (!subjectId || !teacherId || !inviteCode || !name || !status) {
            return res.status(400).json({
                error: "subjectId, teacherId, inviteCode, name, and status are required",
            });
        }

        if (!Number.isFinite(capacity) || capacity <= 0) {
            return res.status(400).json({ error: "capacity must be a positive number" });
        }

        const [existingClass] = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!existingClass) {
            return res.status(404).json({ error: "Class not found" });
        }

        const [subject] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.id, subjectId));

        if (!subject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        const [teacher] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, teacherId));

        if (!teacher) {
            return res.status(404).json({ error: "Teacher not found" });
        }

        if (teacher.role !== "teacher" && teacher.role !== "admin") {
            return res.status(400).json({ error: "teacherId must belong to a teacher or admin user" });
        }

        const [duplicateClass] = await db
            .select({ id: classes.id })
            .from(classes)
            .where(and(eq(classes.inviteCode, inviteCode), sql`${classes.id} <> ${classId}`));

        if (duplicateClass) {
            return res.status(409).json({ error: "Class invite code already exists" });
        }

        const [updatedClass] = await db
            .update(classes)
            .set({
                subjectId,
                teacherId,
                inviteCode,
                name,
                description,
                bannerUrl,
                bannerCldPubId,
                capacity: Math.floor(capacity),
                status,
                schedules,
            })
            .where(eq(classes.id, classId))
            .returning();

        res.status(200).json({ data: updatedClass });
    } catch (error) {
        console.error("PUT /classes/:id error:", error);
        res.status(500).json({ error: "Failed to update class" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const classId = parseNumericId(req.params.id);

        if (!classId) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const [deletedClass] = await db
            .delete(classes)
            .where(eq(classes.id, classId))
            .returning({ id: classes.id });

        if (!deletedClass) {
            return res.status(404).json({ error: "Class not found" });
        }

        res.status(200).json({ data: deletedClass });
    } catch (error) {
        console.error("DELETE /classes/:id error:", error);
        res.status(500).json({ error: "Failed to delete class" });
    }
});

export default router;
