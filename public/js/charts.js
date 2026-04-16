/* eslint-env browser */
(function () {
    const canvases = document.querySelectorAll(".chart-canvas");
    if (!canvases.length) {
        return;
    }

    const parseChartData = canvas => {
        try {
            const raw = canvas.dataset.chartData || "[]";
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.map(item => ({
                label: item.label || item._id || "Unknown",
                count: Number(item.count || 0)
            }));
        } catch (error) {
            return [];
        }
    };

    const drawAxes = (ctx, width, height, padding) => {
        ctx.strokeStyle = "#c8d7eb";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
    };

    const drawBarChart = (ctx, width, height, points) => {
        const padding = 26;
        drawAxes(ctx, width, height, padding);
        if (!points.length) {
            ctx.fillStyle = "#5b7397";
            ctx.fillText("No data", width / 2 - 20, height / 2);
            return;
        }

        const max = Math.max(...points.map(point => point.count), 1);
        const chartWidth = width - padding * 2;
        const barWidth = Math.max(12, chartWidth / (points.length * 1.6));
        const gap = (chartWidth - barWidth * points.length) / (points.length + 1);

        points.forEach((point, index) => {
            const x = padding + gap + index * (barWidth + gap);
            const barHeight = ((height - padding * 2) * point.count) / max;
            const y = height - padding - barHeight;

            ctx.fillStyle = "#3567d6";
            ctx.fillRect(x, y, barWidth, barHeight);
            ctx.fillStyle = "#28486d";
            ctx.font = "10px sans-serif";
            ctx.fillText(String(point.count), x, y - 3);
            ctx.save();
            ctx.translate(x + barWidth / 2, height - padding + 10);
            ctx.rotate(-Math.PI / 6);
            ctx.fillText(point.label.slice(0, 10), 0, 0);
            ctx.restore();
        });
    };

    const drawLineChart = (ctx, width, height, points) => {
        const padding = 26;
        drawAxes(ctx, width, height, padding);
        if (!points.length) {
            ctx.fillStyle = "#5b7397";
            ctx.fillText("No data", width / 2 - 20, height / 2);
            return;
        }

        const max = Math.max(...points.map(point => point.count), 1);
        const chartWidth = width - padding * 2;
        const xStep = points.length > 1 ? chartWidth / (points.length - 1) : 0;

        ctx.beginPath();
        points.forEach((point, index) => {
            const x = padding + index * xStep;
            const y = height - padding - ((height - padding * 2) * point.count) / max;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.strokeStyle = "#2f65d8";
        ctx.lineWidth = 2;
        ctx.stroke();

        points.forEach((point, index) => {
            const x = padding + index * xStep;
            const y = height - padding - ((height - padding * 2) * point.count) / max;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = "#2f65d8";
            ctx.fill();
            ctx.fillStyle = "#28486d";
            ctx.font = "10px sans-serif";
            ctx.fillText(point.label.slice(2), x - 12, height - padding + 10);
        });
    };

    canvases.forEach(canvas => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = canvas.clientWidth || 320;
        canvas.height = 210;
        const points = parseChartData(canvas);
        const type = canvas.dataset.chartType || "bar";

        if (type === "line") {
            drawLineChart(ctx, canvas.width, canvas.height, points);
        } else {
            drawBarChart(ctx, canvas.width, canvas.height, points);
        }
    });
})();
