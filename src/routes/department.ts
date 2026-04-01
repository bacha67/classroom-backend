import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, departments, subjects } from "../db/schema/index.js";
import { parseNumericId, parsePagination, toOptionalTrimmedString, toTrimmedString } from "./_shared.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { currentPage, limitPerPage, offset } = parsePagination(req);
        const search = toTrimmedString(req.query.search);

        const whereClause = search
            ? or(ilike(departments.name, `%${search}%`), ilike(departments.code, `%${search}%`))
            : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(departments)
            .where(whereClause);

        const data = await db
            .select(getTableColumns(departments))
            .from(departments)
            .where(whereClause)
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
        console.error("GET /departments error:", error);
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

router.post("/", async (req, res) => {
    try {
        const code = toTrimmedString(req.body.code);
        const name = toTrimmedString(req.body.name);
        const description = toOptionalTrimmedString(req.body.description);

        if (!code || !name) {
            return res.status(400).json({ error: "code and name are required" });
        }

        const [existingDepartment] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.code, code));

        if (existingDepartment) {
            return res.status(409).json({ error: "Department code already exists" });
        }

        const [createdDepartment] = await db
            .insert(departments)
            .values({ code, name, description })
            .returning();

        res.status(201).json({ data: createdDepartment });
    } catch (error) {
        console.error("POST /departments error:", error);
        res.status(500).json({ error: "Failed to create department" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const departmentId = parseNumericId(req.params.id);

        if (!departmentId) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        const [department] = await db
            .select(getTableColumns(departments))
            .from(departments)
            .where(eq(departments.id, departmentId));

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const [totals] = await db
            .select({
                subjects: sql<number>`count(distinct ${subjects.id})`,
                classes: sql<number>`count(distinct ${classes.id})`,
            })
            .from(departments)
            .leftJoin(subjects, eq(subjects.departmentId, departments.id))
            .leftJoin(classes, eq(classes.subjectId, subjects.id))
            .where(eq(departments.id, departmentId));

        res.status(200).json({
            data: {
                department,
                totals: {
                    subjects: totals?.subjects ?? 0,
                    classes: totals?.classes ?? 0,
                },
            },
        });
    } catch (error) {
        console.error("GET /departments/:id error:", error);
        res.status(500).json({ error: "Failed to fetch department details" });
    }
});

router.get("/:id/subjects", async (req, res) => {
    try {
        const departmentId = parseNumericId(req.params.id);

        if (!departmentId) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        const { currentPage, limitPerPage, offset } = parsePagination(req);

        const [department] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, departmentId));

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(subjects)
            .where(eq(subjects.departmentId, departmentId));

        const data = await db
            .select(getTableColumns(subjects))
            .from(subjects)
            .where(eq(subjects.departmentId, departmentId))
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
        console.error("GET /departments/:id/subjects error:", error);
        res.status(500).json({ error: "Failed to fetch department subjects" });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const departmentId = parseNumericId(req.params.id);

        if (!departmentId) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        const code = toTrimmedString(req.body.code);
        const name = toTrimmedString(req.body.name);
        const description = toOptionalTrimmedString(req.body.description);

        if (!code || !name) {
            return res.status(400).json({ error: "code and name are required" });
        }

        const [department] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, departmentId));

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const [duplicateDepartment] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(and(eq(departments.code, code), sql`${departments.id} <> ${departmentId}`));

        if (duplicateDepartment) {
            return res.status(409).json({ error: "Department code already exists" });
        }

        const [updatedDepartment] = await db
            .update(departments)
            .set({ code, name, description })
            .where(eq(departments.id, departmentId))
            .returning();

        res.status(200).json({ data: updatedDepartment });
    } catch (error) {
        console.error("PUT /departments/:id error:", error);
        res.status(500).json({ error: "Failed to update department" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const departmentId = parseNumericId(req.params.id);

        if (!departmentId) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        const [linkedSubject] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.departmentId, departmentId))
            .limit(1);

        if (linkedSubject) {
            return res.status(409).json({ error: "Department has subjects and cannot be deleted" });
        }

        const [deletedDepartment] = await db
            .delete(departments)
            .where(eq(departments.id, departmentId))
            .returning({ id: departments.id });

        if (!deletedDepartment) {
            return res.status(404).json({ error: "Department not found" });
        }

        res.status(200).json({ data: deletedDepartment });
    } catch (error) {
        console.error("DELETE /departments/:id error:", error);
        res.status(500).json({ error: "Failed to delete department" });
    }
});

export default router;
