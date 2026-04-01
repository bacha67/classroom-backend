import express from "express";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, enrollments, subjects, user } from "../db/schema/index.js";
import { requireRole } from "../middleware/auth.js";
import { parseNumericId, parsePagination, toTrimmedString } from "./_shared.js";

const router = express.Router();
const requireTeacherOrAdmin = requireRole("teacher", "admin");

const getClassEnrollmentCount = async (classId: number) => {
    const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .where(eq(enrollments.classId, classId));

    return result?.count ?? 0;
};

router.get("/", async (req, res) => {
    try {
        const { currentPage, limitPerPage, offset } = parsePagination(req);
        const classId = parseNumericId(req.query.classId);
        const studentId = toTrimmedString(req.query.studentId);

        const filterConditions = [];

        if (classId) {
            filterConditions.push(eq(enrollments.classId, classId));
        }

        if (studentId) {
            filterConditions.push(eq(enrollments.studentId, studentId));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(enrollments)
            .where(whereClause);

        const data = await db
            .select({
                ...getTableColumns(enrollments),
                student: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                class: { ...getTableColumns(classes) },
                subject: {
                    id: subjects.id,
                    name: subjects.name,
                    code: subjects.code,
                },
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(whereClause)
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
        console.error("GET /enrollments error:", error);
        res.status(500).json({ error: "Failed to fetch enrollments" });
    }
});

router.post("/", requireTeacherOrAdmin, async (req, res) => {
    try {
        const studentId = toTrimmedString(req.body.studentId);
        const classId = parseNumericId(req.body.classId);

        if (!studentId || !classId) {
            return res.status(400).json({ error: "studentId and classId are required" });
        }

        const [student] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, studentId));

        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        if (student.role !== "student") {
            return res.status(400).json({ error: "studentId must belong to a student user" });
        }

        const [classRecord] = await db
            .select({ id: classes.id, capacity: classes.capacity })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!classRecord) {
            return res.status(404).json({ error: "Class not found" });
        }

        const [existingEnrollment] = await db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(and(eq(enrollments.studentId, studentId), eq(enrollments.classId, classId)));

        if (existingEnrollment) {
            return res.status(409).json({ error: "Student is already enrolled in this class" });
        }

        const currentEnrollmentCount = await getClassEnrollmentCount(classId);

        if (currentEnrollmentCount >= classRecord.capacity) {
            return res.status(409).json({ error: "Class is already at full capacity" });
        }

        const [createdEnrollment] = await db
            .insert(enrollments)
            .values({ studentId, classId })
            .returning();

        res.status(201).json({ data: createdEnrollment });
    } catch (error) {
        console.error("POST /enrollments error:", error);
        res.status(500).json({ error: "Failed to create enrollment" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const enrollmentId = parseNumericId(req.params.id);

        if (!enrollmentId) {
            return res.status(400).json({ error: "Invalid enrollment id" });
        }

        const [enrollmentRecord] = await db
            .select({
                ...getTableColumns(enrollments),
                student: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                class: {
                    ...getTableColumns(classes),
                },
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .where(eq(enrollments.id, enrollmentId));

        if (!enrollmentRecord) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        res.status(200).json({ data: enrollmentRecord });
    } catch (error) {
        console.error("GET /enrollments/:id error:", error);
        res.status(500).json({ error: "Failed to fetch enrollment details" });
    }
});

router.put("/:id", requireTeacherOrAdmin, async (req, res) => {
    try {
        const enrollmentId = parseNumericId(req.params.id);
        const studentId = toTrimmedString(req.body.studentId);
        const classId = parseNumericId(req.body.classId);

        if (!enrollmentId || !studentId || !classId) {
            return res.status(400).json({ error: "studentId and classId are required" });
        }

        const [existingEnrollment] = await db
            .select(getTableColumns(enrollments))
            .from(enrollments)
            .where(eq(enrollments.id, enrollmentId));

        if (!existingEnrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        const [student] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, studentId));

        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        if (student.role !== "student") {
            return res.status(400).json({ error: "studentId must belong to a student user" });
        }

        const [classRecord] = await db
            .select({ id: classes.id, capacity: classes.capacity })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!classRecord) {
            return res.status(404).json({ error: "Class not found" });
        }

        const [duplicateEnrollment] = await db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
                and(
                    eq(enrollments.studentId, studentId),
                    eq(enrollments.classId, classId),
                    sql`${enrollments.id} <> ${enrollmentId}`
                )
            );

        if (duplicateEnrollment) {
            return res.status(409).json({ error: "Student is already enrolled in this class" });
        }

        if (existingEnrollment.classId !== classId) {
            const currentEnrollmentCount = await getClassEnrollmentCount(classId);

            if (currentEnrollmentCount >= classRecord.capacity) {
                return res.status(409).json({ error: "Class is already at full capacity" });
            }
        }

        const [updatedEnrollment] = await db
            .update(enrollments)
            .set({ studentId, classId })
            .where(eq(enrollments.id, enrollmentId))
            .returning();

        res.status(200).json({ data: updatedEnrollment });
    } catch (error) {
        console.error("PUT /enrollments/:id error:", error);
        res.status(500).json({ error: "Failed to update enrollment" });
    }
});

router.delete("/:id", requireTeacherOrAdmin, async (req, res) => {
    try {
        const enrollmentId = parseNumericId(req.params.id);

        if (!enrollmentId) {
            return res.status(400).json({ error: "Invalid enrollment id" });
        }

        const [deletedEnrollment] = await db
            .delete(enrollments)
            .where(eq(enrollments.id, enrollmentId))
            .returning({ id: enrollments.id });

        if (!deletedEnrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        res.status(200).json({ data: deletedEnrollment });
    } catch (error) {
        console.error("DELETE /enrollments/:id error:", error);
        res.status(500).json({ error: "Failed to delete enrollment" });
    }
});

export default router;
