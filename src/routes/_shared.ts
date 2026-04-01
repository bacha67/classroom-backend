import type { Request } from "express";

export const parseNumericId = (value: unknown) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const parsePagination = (req: Request) => {
    const pageValue = Number(req.query.page ?? 1);
    const limitValue = Number(req.query.limit ?? 10);

    const currentPage = Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1;
    const limitPerPage = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 10;

    return {
        currentPage,
        limitPerPage,
        offset: (currentPage - 1) * limitPerPage,
    };
};

export const toTrimmedString = (value: unknown) => {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const toOptionalTrimmedString = (value: unknown) => {
    if (value == null) {
        return null;
    }

    return toTrimmedString(value);
};

export const toBoolean = (value: unknown) => {
    if (typeof value === "boolean") {
        return value;
    }

    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    return null;
};
