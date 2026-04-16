const buildListOptions = query => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(5, Number(query.limit) || 10));
    const order = String(query.order || "desc").toLowerCase() === "asc" ? 1 : -1;
    const allowedSortFields = ["date", "priority", "status", "slaDueAt"];
    const sortBy = allowedSortFields.includes(query.sortBy) ? query.sortBy : "date";

    return {
        page,
        limit,
        skip: (page - 1) * limit,
        sort: { [sortBy]: order },
        sortBy,
        order: order === 1 ? "asc" : "desc"
    };
};

const buildPagination = ({ page, limit, total, basePath, query = {} }) => {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasPrev = page > 1;
    const hasNext = page < totalPages;
    const cleaned = { ...query };
    delete cleaned.page;

    const toQuery = p => {
        const params = new URLSearchParams({ ...cleaned, page: String(p), limit: String(limit) });
        return `${basePath}?${params.toString()}`;
    };

    return {
        page,
        limit,
        total,
        totalPages,
        hasPrev,
        hasNext,
        prevLink: hasPrev ? toQuery(page - 1) : null,
        nextLink: hasNext ? toQuery(page + 1) : null
    };
};

module.exports = {
    buildListOptions,
    buildPagination
};
