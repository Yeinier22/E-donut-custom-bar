/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import * as echarts from "echarts";
import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";

export class Visual implements powerbi.extensibility.IVisual {
    private chartContainer: HTMLDivElement;
    private chartInstance: echarts.ECharts;

    constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
        this.chartContainer = document.createElement("div");
        this.chartContainer.style.width = "100%";
        this.chartContainer.style.height = "100%";
        options.element.appendChild(this.chartContainer);
        this.chartInstance = echarts.init(this.chartContainer);
    }

    public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
        const dataView = options.dataViews && options.dataViews[0];
        if (!dataView || !dataView.categorical) {
            this.chartInstance.clear();
            return;
        }

        const categorical = dataView.categorical;
        const categoryCols = categorical.categories || [];
        const rowCount = categoryCols[0]?.values?.length || 0;

        // Construir etiquetas del eje X admitiendo múltiples columnas en Category
        const categories = rowCount
            ? Array.from({ length: rowCount }, (_, i) =>
                (categoryCols.length
                    ? categoryCols.map(c => c.values?.[i] ?? "").join(" | ")
                    : String(i + 1)))
            : [];

        // Utilidad: normalizar valores a números o null
        const toNumberArray = (arr: any[]) => (arr || []).map((v) =>
            (v === null || v === undefined || v === "") ? null : (typeof v === "number" ? v : Number(v))
        );

        let seriesData: any[] = [];
        let legendNames: string[] = [];

        const valuesCols: any = categorical.values || [];
        const groups = valuesCols?.grouped?.() as any[] | undefined;

        if (Array.isArray(groups) && groups.length > 0) {
            // Con leyenda: una serie por grupo de leyenda; si hay varias medidas en Series, crear una por medida
            const measureCount = groups[0]?.values?.length || 0;
            for (const group of groups) {
                if (measureCount <= 1) {
                    const name = group?.name ?? "Group";
                    legendNames.push(name);
                    seriesData.push({
                        name,
                        type: "bar",
                        data: toNumberArray(group?.values?.[0]?.values || []),
                        label: { show: true, position: "top" }
                    });
                } else {
                    for (const mv of (group.values || [])) {
                        const name = `${group?.name ?? "Group"} · ${mv?.source?.displayName ?? "Series"}`;
                        legendNames.push(name);
                        seriesData.push({
                            name,
                            type: "bar",
                            data: toNumberArray(mv?.values || []),
                            label: { show: true, position: "top" }
                        });
                    }
                }
            }
        } else {
            // Sin leyenda: una serie por cada medida seleccionada en Series
            const measures: any[] = (valuesCols as any[]) || [];
            seriesData = measures.map((mv: any, idx: number) => ({
                name: mv?.source?.displayName ?? `Series ${idx + 1}`,
                type: "bar",
                data: toNumberArray(mv?.values || []),
                label: { show: true, position: "top" }
            }));
            legendNames = seriesData.map(s => s.name);
        }

        // Guardas básicas
        if (!categories.length || !seriesData.length) {
            this.chartInstance.clear();
            return;
        }

        const option: echarts.EChartsCoreOption = {
            tooltip: { trigger: "axis" },
            legend: { top: "5%", data: legendNames },
            grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
            xAxis: { type: "category", data: categories },
            yAxis: { type: "value" },
            series: seriesData
        };

        this.chartInstance.clear();
        this.chartInstance.setOption(option, true);
        this.chartInstance.resize();
    }

    public destroy() {
        this.chartInstance.dispose();
    }
}