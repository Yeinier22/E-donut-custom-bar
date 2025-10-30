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
import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import "./../style/visual.less";

// Ensure solid color (no alpha). If input has rgba/argb/hex with alpha, drop alpha.
function getSolidColor(color: string): string {
  if (!color) return "#66aaff";
  const c = color.trim();
  const mRgba = c.match(/^rgba\s*\((\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*),(\s*\d*\.?\d+\s*)\)/i);
  if (mRgba) {
    const r = parseInt(mRgba[1]);
    const g = parseInt(mRgba[2]);
    const b = parseInt(mRgba[3]);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const mRgb = c.match(/^rgb\s*\((\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*)\)/i);
  if (mRgb) return c; // already solid rgb
  // hex
  if (c[0] === '#') {
    const hex = c.replace('#','');
    if (hex.length === 4 || hex.length === 8) {
      // #RGBA or #RRGGBBAA → drop alpha
      if (hex.length === 4) {
        const r = parseInt(hex[0]+hex[0],16);
        const g = parseInt(hex[1]+hex[1],16);
        const b = parseInt(hex[2]+hex[2],16);
        return `rgb(${r}, ${g}, ${b})`;
      }
      const r = parseInt(hex.substring(0,2),16);
      const g = parseInt(hex.substring(2,4),16);
      const b = parseInt(hex.substring(4,6),16);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return c; // leave as-is (#RGB/#RRGGBB or named color)
}

export class Visual implements powerbi.extensibility.IVisual {
  private chartContainer: HTMLDivElement;
  private chartInstance: echarts.ECharts;
  private host: powerbi.extensibility.IVisualHost;
  private seriesColors: { [key: string]: string } = {};
  private dataView: powerbi.DataView | undefined;
  // Drilldown state
  private isDrilled: boolean = false;
  private baseCategories: any[] = [];
  private baseSeriesSnapshot: any[] = [];
  private baseLegendNames: string[] = [];
  private drillCategory: string | null = null;
  private hoverGraphic: any[] = [];
  private selectionGraphic: any[] = [];
  private selectedIndex: number | null = null;
  private currentCategories: any[] = [];

  // Restore to base (drill-up)
  private restoreBaseView() {
    if (!this.chartInstance) return;
  const objects: any = this.dataView?.metadata?.objects || {};
  const legendSettings: any = objects?.legend || {};
  const pos: string = legendSettings["position"] || "top";
  const align: string = legendSettings["alignment"] || "center"; // left|center|right
  const extra: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;
  const padding: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
    const isVertical = pos === "left" || pos === "right";
    let legendTop: any = undefined, legendBottom: any = undefined, legendLeft: any = undefined, legendRight: any = undefined;
    if (pos === "top") legendTop = `${5 + extra}%`;
    if (pos === "bottom") legendBottom = `${5 + extra}%`;
    if (pos === "left") { legendLeft = "2%"; legendTop = "5%"; }
    if (pos === "right") { legendRight = "2%"; legendTop = "5%"; }
    if (pos === "top" || pos === "bottom") {
      if (align === "left") legendLeft = "2%";
      else if (align === "right") legendRight = "2%";
      else legendLeft = "center"; // center alignment
    }
    const gridBottom = pos === "bottom" ? `${10 + extra}%` : "3%";

    this.chartInstance.setOption(
      {
        title: { text: "", left: "center", top: "5%" },
        xAxis: { data: this.baseCategories },
        series: this.baseSeriesSnapshot as any,
  legend: { data: this.baseLegendNames, top: legendTop, bottom: legendBottom, left: legendLeft, right: legendRight, orient: isVertical ? "vertical" : "horizontal", padding },
        grid: { left: "3%", right: "4%", bottom: gridBottom, containLabel: true },
        animationDurationUpdate: 500,
        animationEasingUpdate: "cubicOut"
      } as any,
      false
    );
    this.isDrilled = false;
    this.drillCategory = null;
    // Clear hover band on restore and redraw overlays
    this.hoverGraphic = [];
    // Clear any selection when returning to base level
    this.selectedIndex = null;
    this.selectionGraphic = [];
    this.currentCategories = Array.isArray(this.baseCategories) ? [...this.baseCategories] : [];
    // Force clear of any graphic overlays
    (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
    this.updateDrillGraphics();
  }

  // Reset equals restore for 2-level drill
  private resetFullView() {
    // In drill level: reset only clears selection band; Back button restores
    if (this.isDrilled) {
      this.selectedIndex = null;
      this.selectionGraphic = [];
      this.updateDrillGraphics();
      return;
    }
    this.restoreBaseView();
  }

  private updateDrillGraphics() {
    const buttons: any[] = [
      {
        type: "text",
        id: "btnBack",
        left: 20,
        top: 20,
        z: 1000,
        invisible: !this.isDrilled,
        style: {
          text: "↩ Back",
          font: "bold 14px Segoe UI",
          fill: "#555",
        },
        cursor: "pointer",
        onclick: () => this.restoreBaseView(),
      },
      {
        type: "text",
        id: "btnReset",
        left: 100,
        top: 20,
        z: 1000,
        invisible: !this.isDrilled,
        style: {
          text: "⟳ Reset",
          font: "bold 14px Segoe UI",
          fill: "#555",
        },
        cursor: "pointer",
        onclick: () => this.resetFullView(),
      },
    ];
    const combined = [
      ...(this.isDrilled ? (this.selectionGraphic || []) : []),
      ...(this.hoverGraphic || []),
      ...buttons
    ];
    (this.chartInstance as any).setOption(
      { graphic: combined } as any,
      { replaceMerge: ["graphic"] }
    );
  }

  private buildDrillForCategory(clickedCategory: any): { categories: any[]; series: any[] } {
    const dv = this.dataView;
    const categorical = dv?.categorical;
    const cat1 = categorical?.categories?.[0]?.values || [];
    const cat2 = categorical?.categories?.[1]?.values || [];
    const valuesCols: any = categorical?.values || [];
    const groups = valuesCols?.grouped?.() as any[] | undefined;
    const rowCount = (cat1 as any[]).length;
    const idxs: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      if (cat1[i] === clickedCategory) idxs.push(i);
    }
    const cat2Order: any[] = [];
    const seen2 = new Set<any>();
    for (const i of idxs) {
      const v = (cat2 as any[])[i];
      if (!seen2.has(v)) {
        seen2.add(v);
        cat2Order.push(v);
      }
    }

    // Bring current Data Labels styles
    const dl: any = (dv?.metadata?.objects as any)?.dataLabels || {};
    const dlShow: boolean = dl["show"] !== false;
    const dlColor: string = (dl["color"] as any)?.solid?.color || "#444";
    const dlFontFamily: string = (dl["fontFamily"] as string) || "Segoe UI";
    const dlFontSize: number = typeof dl["fontSize"] === "number" ? dl["fontSize"] : 12;
    const dlFontStyleSetting: string = (dl["fontStyle"] as string) || "normal";
    const dlFontWeight: any = dlFontStyleSetting === "bold" ? "bold" : "normal";
    const dlFontStyle: any = dlFontStyleSetting === "italic" ? "italic" : "normal";
    const dlTransparency: number = typeof dl["transparency"] === "number" ? dl["transparency"] : 0;
    const dlOpacity: number = Math.max(0, Math.min(1, 1 - (dlTransparency / 100)));

    const toNumber = (x: any) =>
      x === null || x === undefined || x === "" ? 0 : typeof x === "number" ? x : Number(x);

    const buildSeries = (name: string, dataArr: number[], color: string) => ({
      name,
      type: "bar",
      data: dataArr,
      label: {
        show: dlShow,
        position: "top",
        color: dlColor,
        fontFamily: dlFontFamily,
        fontSize: dlFontSize,
        fontStyle: dlFontStyle,
        fontWeight: dlFontWeight,
        opacity: dlOpacity,
      },
      itemStyle: { color },
    });

    const seriesOut: any[] = [];

    if (Array.isArray(groups) && groups.length > 0) {
      const measureCount = groups[0]?.values?.length || 0;
      for (const group of groups) {
        if (measureCount <= 1) {
          const name = group?.name ?? "Group";
          const src = group?.values?.[0]?.values || [];
          const color = this.seriesColors?.[name] || "#6688cc";
          const sums = cat2Order.map((c2) => {
            let s = 0;
            for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]);
            return s;
          });
          seriesOut.push(buildSeries(name, sums, color));
        } else {
          for (const mv of group.values || []) {
            const name = `${group?.name ?? "Group"} · ${mv?.source?.displayName ?? "Series"}`;
            const src = mv?.values || [];
            const color = this.seriesColors?.[name] || "#6688cc";
            const sums = cat2Order.map((c2) => {
              let s = 0;
              for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]);
              return s;
            });
            seriesOut.push(buildSeries(name, sums, color));
          }
        }
      }
    } else {
      const measures: any[] = (valuesCols as any[]) || [];
      for (const mv of measures) {
        const name = mv?.source?.displayName ?? "Series";
        const src = mv?.values || [];
        const color = this.seriesColors?.[name] || "#6688cc";
        const sums = cat2Order.map((c2) => {
          let s = 0;
          for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]);
          return s;
        });
        seriesOut.push(buildSeries(name, sums, color));
      }
    }

    return { categories: cat2Order, series: seriesOut };
  }

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.chartContainer = document.createElement("div");
    this.chartContainer.style.width = "100%";
    this.chartContainer.style.height = "100%";
    options.element.appendChild(this.chartContainer);
    this.chartInstance = echarts.init(this.chartContainer);
    this.host = options.host;
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
    const dataView = options.dataViews && options.dataViews[0];
    this.dataView = dataView;
    if (!dataView || !dataView.categorical) {
      this.chartInstance.clear();
      return;
    }

    const categorical = dataView.categorical;
    const categoryCols = categorical.categories || [];
    const cat1All = categoryCols[0]?.values || [];
    const cat2All = categoryCols[1]?.values || [];
    const rowCount = cat1All.length || 0;

    // Construir eje X: usar solo el primer nivel (Category[0]) con agregación por nivel
    const uniqueCat1: any[] = [];
    const idxsByCat1 = new Map<any, number[]>();
    for (let i = 0; i < rowCount; i++) {
      const v = (cat1All as any[])[i];
      if (!idxsByCat1.has(v)) {
        idxsByCat1.set(v, []);
        uniqueCat1.push(v);
      }
      idxsByCat1.get(v)!.push(i);
    }
    const categories = uniqueCat1;

    // Utilidad: normalizar valores a números o null
    const toNumberArray = (arr: any[]) =>
      (arr || []).map((v) =>
        v === null || v === undefined || v === ""
          ? null
          : typeof v === "number"
          ? v
          : Number(v)
      );

    let seriesData: any[] = [];
    let legendNames: string[] = [];
    const nameCount: Record<string, number> = {};
    const makeUniqueName = (raw: any): string => {
      let base = (raw === null || raw === undefined || String(raw) === "") ? "(Blank)" : String(raw);
      if (nameCount[base] === undefined) {
        nameCount[base] = 1;
        return base;
      } else {
        nameCount[base] += 1;
        return `${base} (${nameCount[base]})`;
      }
    };

    // Data Labels settings
    const dl: any = (dataView.metadata?.objects as any)?.dataLabels || {};
    const dlShow: boolean = dl["show"] !== false;
    const dlPositionSetting: string = dl["position"] || "auto";
    const dlColor: string = (dl["color"] as any)?.solid?.color || "#444";
    const dlFontFamily: string = (dl["fontFamily"] as string) || "Segoe UI";
    const dlFontSize: number = typeof dl["fontSize"] === "number" ? dl["fontSize"] : 12;
    const dlFontStyleSetting: string = (dl["fontStyle"] as string) || "normal"; // normal|bold|italic
    const dlFontWeight: any = dlFontStyleSetting === "bold" ? "bold" : "normal";
    const dlFontStyle: any = dlFontStyleSetting === "italic" ? "italic" : "normal";
    const dlTransparency: number = typeof dl["transparency"] === "number" ? dl["transparency"] : 0;
    const dlOpacity: number = Math.max(0, Math.min(1, 1 - (dlTransparency / 100)));

    const mapLabelPosition = (pos: string): any => {
      switch (pos) {
        case "insideEnd": return "insideTop"; // near end inside (vertical bars)
        case "outsideEnd": return "top";     // outside end
        case "insideCenter": return "inside";
        case "insideBase": return "insideBottom";
        case "auto":
        default: return "top";
      }
    };
    const dlPosition = mapLabelPosition(dlPositionSetting);

    const valuesCols: any = categorical.values || [];
    const groups = valuesCols?.grouped?.() as any[] | undefined;

    const colorHelper = new ColorHelper((this.host as any).colorPalette, {
      objectName: "dataPoint",
      propertyName: "fill",
    } as any);

    const resolveSeriesColor = (seriesName: string, group?: any): string => {
      const objects: any = this.dataView?.metadata?.objects || {};
      const dataPoint: any = objects["dataPoint"] || {};
      // 1) Color guardado por el panel (metadata.objects.dataPoint[seriesName])
      const userColorMeta: string | undefined = dataPoint?.[seriesName]?.solid?.color
        ?? dataPoint?.[seriesName]?.fill?.solid?.color;
      // 2) Color persistido a nivel de grupo/serie (si el runtime lo envía ahí)
      const userColorGroup: string | undefined = group?.objects?.dataPoint?.fill?.solid?.color
        ?? group?.values?.[0]?.objects?.dataPoint?.fill?.solid?.color
        ?? group?.values?.[0]?.source?.objects?.dataPoint?.fill?.solid?.color;
      const userColor: string | undefined = userColorMeta ?? userColorGroup;
      const color = userColor
        || this.seriesColors[seriesName]
        || (colorHelper.getColorForSeriesValue(objects, seriesName) as any);
      this.seriesColors[seriesName] = color;
      return color;
    };

    const toNumber = (x: any) =>
      x === null || x === undefined || x === "" ? 0 : typeof x === "number" ? x : Number(x);

    if (Array.isArray(groups) && groups.length > 0) {
      // Con leyenda: una serie por grupo de leyenda; si hay varias medidas en Series, crear una por medida
      const measureCount = groups[0]?.values?.length || 0;
      for (const group of groups) {
        if (measureCount <= 1) {
          const name = makeUniqueName(group?.name);
          const color = resolveSeriesColor(name, group);
          legendNames.push(name);
          // Agregar por Category[0]
          const src: any[] = group?.values?.[0]?.values || [];
          const agg = uniqueCat1.map((c) => {
            const idxs = idxsByCat1.get(c) || [];
            let s = 0; for (const i of idxs) s += toNumber(src[i]);
            return s;
          });
          seriesData.push({
            name,
            type: "bar",
            data: agg,
            label: {
              show: dlShow,
              position: dlPosition,
              color: dlColor,
              fontFamily: dlFontFamily,
              fontSize: dlFontSize,
              fontStyle: dlFontStyle,
              fontWeight: dlFontWeight,
              opacity: dlOpacity
            },
            itemStyle: { color },
          });
        } else {
          for (const mv of group.values || []) {
            const left = (group?.name === null || group?.name === undefined || String(group?.name) === "") ? "(Blank)" : String(group?.name);
            const right = mv?.source?.displayName ?? "Series";
            const name = makeUniqueName(`${left} · ${right}`);
            const color = resolveSeriesColor(name, group);
            legendNames.push(name);
            const src: any[] = mv?.values || [];
            const agg = uniqueCat1.map((c) => {
              const idxs = idxsByCat1.get(c) || [];
              let s = 0; for (const i of idxs) s += toNumber(src[i]);
              return s;
            });
            seriesData.push({
              name,
              type: "bar",
              data: agg,
              label: {
                show: dlShow,
                position: dlPosition,
                color: dlColor,
                fontFamily: dlFontFamily,
                fontSize: dlFontSize,
                fontStyle: dlFontStyle,
                fontWeight: dlFontWeight,
                opacity: dlOpacity
              },
              itemStyle: { color },
            });
          }
        }
      }
    } else {
      // Sin leyenda: una serie por cada medida seleccionada en Series
      const measures: any[] = (valuesCols as any[]) || [];
      seriesData = measures.map((mv: any, idx: number) => {
        const name = mv?.source?.displayName ?? `Series ${idx + 1}`;
        const color = resolveSeriesColor(name);
        const src: any[] = mv?.values || [];
        const agg = uniqueCat1.map((c) => {
          const idxs = idxsByCat1.get(c) || [];
          let s = 0; for (const i of idxs) s += toNumber(src[i]);
          return s;
        });
        return {
          name,
          type: "bar",
          data: agg,
          label: {
            show: dlShow,
            position: dlPosition,
            color: dlColor,
            fontFamily: dlFontFamily,
            fontSize: dlFontSize,
            fontStyle: dlFontStyle,
            fontWeight: dlFontWeight,
            opacity: dlOpacity
          },
          itemStyle: { color },
        };
      });
      legendNames = seriesData.map((s) => s.name);
    }

    // Guardas básicas
    if (!categories.length || !seriesData.length) {
      this.chartInstance.clear();
      return;
    }

  // Hover style settings
  const hoverObj: any = (dataView.metadata?.objects as any)?.hoverStyle || {};
  const hoverColor: string = hoverObj?.color?.solid?.color || "#66aaff";
  const fillOpacityPct: number = typeof hoverObj?.fillOpacity === "number" ? hoverObj.fillOpacity
    : (typeof hoverObj?.opacity === "number" ? hoverObj.opacity : 30);
  const borderOpacityPct: number = typeof hoverObj?.borderOpacity === "number" ? hoverObj.borderOpacity : 50;
  const fillOpacity: number = Math.max(0, Math.min(1, fillOpacityPct / 100));
  const strokeOpacity: number = Math.max(0, Math.min(1, borderOpacityPct / 100));
  const hoverDuration: number = typeof hoverObj?.duration === "number" ? hoverObj.duration : 300;
  const hoverEasing: string = typeof hoverObj?.easing === "string" ? hoverObj.easing : "cubicOut";
  const hoverBorderColor: string = hoverObj?.borderColor?.solid?.color || "#00000020";
  const hoverBorderWidth: number = typeof hoverObj?.borderWidth === "number" ? hoverObj.borderWidth : 0;
  const expandX: number = typeof hoverObj?.expandX === "number" ? hoverObj.expandX : 8;
  const expandY: number = typeof hoverObj?.expandY === "number" ? hoverObj.expandY : 8;

  // We won't use item emphasis color, instead we draw a background band per category (xIndex) using axisPointer-like graphic on hover
  // but keep mild emphasis to avoid clash with selection styling.
  const seriesWithHover: any[] = (seriesData || []).map((s: any) => ({
    ...s,
    emphasis: {
      focus: undefined,
      scale: false
    },
    stateAnimation: { duration: hoverDuration, easing: hoverEasing }
  }));

  const xAxisSettings: any = (dataView.metadata?.objects as any)?.xAxis || {};
  const yAxisSettings: any = (dataView.metadata?.objects as any)?.yAxis || {};
  // X Axis toggles
  const showXAxisLine: boolean = xAxisSettings["showAxisLine"] !== false; // default true
  const showXLabels: boolean = xAxisSettings["showLabels"] !== false; // default true
  const xLabelColor: string = (xAxisSettings["labelColor"] as any)?.solid?.color || "#666666";
  const xLabelSize: number = (typeof xAxisSettings["labelSize"] === "number" ? xAxisSettings["labelSize"] : 12);
  const xRotateLabels: number = (typeof xAxisSettings["rotateLabels"] === "number" ? xAxisSettings["rotateLabels"] : 0);
  const xFontFamily: string = (xAxisSettings["fontFamily"] as string) || "Segoe UI, sans-serif";
  const xFontStyleSetting: string = (xAxisSettings["fontStyle"] as string) || "regular"; // regular|bold|italic|boldItalic
  const xFontWeight: any = (xFontStyleSetting === "bold" || xFontStyleSetting === "boldItalic") ? "bold" : "normal";
  const xFontStyle: any = (xFontStyleSetting === "italic" || xFontStyleSetting === "boldItalic") ? "italic" : "normal";
  let showXGridLines: boolean;
  if (typeof xAxisSettings["showGridLines"] === "boolean") {
    showXGridLines = xAxisSettings["showGridLines"];
  } else {
    showXGridLines = false; // default off for vertical grid lines to avoid clutter
  }
  // Y Axis toggles
  const showYLabels: boolean = yAxisSettings["showLabels"] !== false; // default true
  const yLabelColor: string = (yAxisSettings["labelColor"] as any)?.solid?.color || "#666666";
  const yLabelSize: number = (typeof yAxisSettings["labelSize"] === "number" ? yAxisSettings["labelSize"] : 12);
  const yFontFamily: string = (yAxisSettings["fontFamily"] as string) || "Segoe UI, sans-serif";
  const yFontStyleSetting: string = (yAxisSettings["fontStyle"] as string) || "regular";
  const yFontWeight: any = (yFontStyleSetting === "bold" || yFontStyleSetting === "boldItalic") ? "bold" : "normal";
  const yFontStyle: any = (yFontStyleSetting === "italic" || yFontStyleSetting === "boldItalic") ? "italic" : "normal";
  let showYGridLines: boolean;
  if (typeof yAxisSettings["showGridLines"] === "boolean") {
    showYGridLines = yAxisSettings["showGridLines"];
  } else if (typeof yAxisSettings["showGridlines"] === "boolean") {
    // legacy compatibility
    showYGridLines = yAxisSettings["showGridlines"];
  } else {
    showYGridLines = true; // horizontal grid lines on by default
  }

  const legendSettings: any = (dataView.metadata?.objects as any)?.legend || {};
  const legendPosition: string = legendSettings["position"] || "top";
  const legendAlignment: string = legendSettings["alignment"] || "center"; // left | center | right
  const legendIconSetting: string = legendSettings["iconShape"] || "rect";
  const legendIcon: string = legendIconSetting === "square" ? "rect" : legendIconSetting;
  const legendPadding: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
  const legendExtraMargin: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;

  // Selection Style settings (for clicks in drill level)
  const selObj: any = (dataView.metadata?.objects as any)?.selectionStyle || {};
  const selColor: string = getSolidColor(selObj?.color?.solid?.color || "#0096FF");
  const selBorderColor: string = getSolidColor(selObj?.borderColor?.solid?.color || "#0078D4");
  const selBorderWidth: number = typeof selObj?.borderWidth === "number" ? selObj.borderWidth : 1.5;
  const selOpacityPct: number = typeof selObj?.opacity === "number" ? selObj.opacity : 40;
  const selOpacity: number = Math.max(0, Math.min(1, selOpacityPct / 100));

  // Compute legend placement (adapt to drill state)
  const isVertical = (legendPosition === "left" || legendPosition === "right");
  let legendTop: any = undefined;
  let legendBottom: any = undefined;
  let legendLeft: any = undefined;
  let legendRight: any = undefined;

  if (legendPosition === "top" || legendPosition === "bottom") {
    // Use alignment for horizontal positions
    if (legendPosition === "top") {
      const topBase = this.isDrilled ? 8 : 5;
      legendTop = `${topBase + legendExtraMargin}%`;
    } else {
      const bottomBase = this.isDrilled ? 10 : 5;
      legendBottom = `${bottomBase + legendExtraMargin}%`;
    }
    if (legendAlignment === "left") legendLeft = "2%";
    else if (legendAlignment === "right") legendRight = "2%";
    else legendLeft = "center"; // center
  } else if (legendPosition === "left") {
    legendLeft = "2%";
    legendTop = "5%";
  } else if (legendPosition === "right") {
    legendRight = "2%";
    legendTop = "5%";
  } else if (legendPosition === "topCenter" || legendPosition === "bottomCenter") {
    // Back-compat for previous centered options
    if (legendPosition === "topCenter") {
      const t = this.isDrilled ? 8 : 5;
      legendTop = `${t + legendExtraMargin}%`;
    } else {
      const b = this.isDrilled ? 10 : 5;
      legendBottom = `${b + legendExtraMargin}%`;
    }
    legendLeft = "center";
  } else if (legendPosition === "bottomRight") {
    {
      const b = this.isDrilled ? 10 : 5;
      legendBottom = `${b + legendExtraMargin}%`;
    }
    legendRight = "2%";
  }

  // Grid bottom adjustment to prevent overlap when legend is bottom on drill
  const gridBottom = (legendPosition === "bottom" || legendPosition === "bottomCenter" || legendPosition === "bottomRight")
    ? `${(this.isDrilled ? 16 : 12) + legendExtraMargin}%`
    : "3%";

    const option: echarts.EChartsCoreOption = {
      tooltip: { trigger: "axis" },
      title: {
        text: this.isDrilled && this.drillCategory ? `Details for ${this.drillCategory}` : "",
        left: "center",
        top: this.isDrilled ? "2%" : "5%",
        textStyle: { fontSize: 16 as any, fontWeight: "bold", color: "#333" }
      },
      legend: {
        type: "plain",
        orient: isVertical ? "vertical" : "horizontal",
        top: legendTop,
        bottom: legendBottom,
        left: legendLeft,
        right: legendRight,
        icon: legendIcon,
        padding: legendPadding,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { fontSize: 12 },
        data: legendNames
      },
      grid: { left: "3%", right: "4%", bottom: gridBottom, containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { show: showXAxisLine },
        axisTick: { show: false },
        splitLine: { show: showXGridLines },
        axisLabel: {
          show: showXLabels,
          rotate: xRotateLabels,
          fontSize: xLabelSize,
          color: xLabelColor,
          fontFamily: xFontFamily,
          fontStyle: xFontStyle,
          fontWeight: xFontWeight,
          margin: 10
        }
      },
      yAxis: {
        type: "value",
        axisLabel: {
          show: showYLabels,
          fontSize: yLabelSize,
          color: yLabelColor,
          fontFamily: yFontFamily,
          fontStyle: yFontStyle,
          fontWeight: yFontWeight,
          margin: 8
        },
        splitLine: { show: showYGridLines }
      },
      series: seriesWithHover,
    };

    /*const option: echarts.EChartsCoreOption = {
  color: ["#3366CC", "#FF66B2", "#91CC75", "#EE6666"], // azul, rosa, verde, rojo (puedes cambiarlo)
  tooltip: { trigger: "axis" },
  legend: { top: "5%", data: legendNames },
  grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
  xAxis: { type: "category", data: categories },
  yAxis: { type: "value", splitLine: { show: false } },
  series: seriesData
};*/

    this.chartInstance.clear();
  this.chartInstance.setOption(option, true);
    this.chartInstance.resize();
  this.currentCategories = Array.isArray(categories) ? [...categories] : [];

    // Save base state for drill-up if not currently drilled
    if (!this.isDrilled) {
      this.baseCategories = Array.isArray(categories) ? [...categories] : [];
      try {
        this.baseSeriesSnapshot = JSON.parse(JSON.stringify(seriesWithHover));
      } catch {
        this.baseSeriesSnapshot = seriesWithHover.map((s) => ({ ...s }));
      }
      this.baseLegendNames = Array.isArray(legendNames) ? [...legendNames] : [];
    }

  // Custom hover background band per x category (treat both bars in same category as a group)
    let currentHoverIndex: number | null = null;
    const updateHoverBand = (xIndex: number | null) => {
      if (xIndex === null) {
        this.hoverGraphic = [];
        this.updateDrillGraphics();
        return;
      }
      const ec: any = this.chartInstance as any;
      const cats = this.currentCategories || [];
      const centerPx = ec.convertToPixel({ xAxisIndex: 0 }, cats[xIndex]);
      // Estimate band width from neighbor centers or fall back to axis band width
      const leftCenter = xIndex > 0 ? ec.convertToPixel({ xAxisIndex: 0 }, cats[xIndex - 1]) : undefined;
      const rightCenter = xIndex < cats.length - 1 ? ec.convertToPixel({ xAxisIndex: 0 }, cats[xIndex + 1]) : undefined;
      let halfStep = 0;
      if (leftCenter !== undefined && rightCenter !== undefined) {
        halfStep = Math.min(Math.abs(centerPx - leftCenter), Math.abs(rightCenter - centerPx)) / 2;
      } else if (rightCenter !== undefined) {
        halfStep = Math.abs(rightCenter - centerPx) / 2;
      } else if (leftCenter !== undefined) {
        halfStep = Math.abs(centerPx - leftCenter) / 2;
      } else {
        try {
          const xAxisModel = ec.getModel().getComponent('xAxis', 0);
          const axis = xAxisModel?.axis;
          const bw = axis?.getBandWidth ? axis.getBandWidth() : 40;
          // convert axis units width to pixels by sampling delta of two close values
          const testRight = ec.convertToPixel({ xAxisIndex: 0 }, categories[xIndex]);
          const testLeft = testRight - (bw || 40);
          halfStep = Math.abs(testRight - testLeft) / 2;
        } catch { halfStep = 20; }
      }
      const coord0 = centerPx - halfStep;
      const coord1 = centerPx + halfStep;
      const grid = ec.getModel().getComponent('grid', 0);
      let topPx = 0, bottomPx = 0;
      try {
        const rect = grid?.coordinateSystem?.getRect();
        topPx = rect?.y ?? 0; bottomPx = (rect?.y ?? 0) + (rect?.height ?? 0);
      } catch {}
      const leftPx = Math.min(coord0, coord1) - expandX;
      const rightPx = Math.max(coord0, coord1) + expandX;
  const width = Math.max(0, rightPx - leftPx);
  // Do not overshoot below the x-axis line, only above
  const height = Math.max(0, (bottomPx - topPx) + expandY);
  const rectX = leftPx;
  const rectY = topPx - expandY;
      const solidFill = getSolidColor(hoverColor);
      const solidStroke = getSolidColor(hoverBorderColor);
      this.hoverGraphic = [{
        type: 'rect',
        id: 'hoverBand',
        z: 5,
        shape: { x: rectX, y: rectY, width, height, r: 4 },
        style: { fill: solidFill, stroke: solidStroke, lineWidth: hoverBorderWidth, fillOpacity, strokeOpacity },
        silent: true
      }];
      this.updateDrillGraphics();
    };

    const bindHoverHandlers = () => {
      const zr = this.chartInstance.getZr();
      zr.off('mousemove');
      zr.on('mousemove', (e: any) => {
        const ec: any = this.chartInstance as any;
        const inGrid = ec.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
        if (!inGrid) {
          if (currentHoverIndex !== null) { currentHoverIndex = null; updateHoverBand(null); }
          return;
        }
        const val = ec.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
        if (!Array.isArray(val)) return;
        const xVal = val[0];
        const cats = this.currentCategories || [];
        let xi: number = -1;
        if (typeof xVal === 'number' && Number.isFinite(xVal)) xi = Math.round(xVal);
        else xi = cats.indexOf(xVal);
        if (xi >= 0 && xi < cats.length) {
          if (xi !== currentHoverIndex) { currentHoverIndex = xi; updateHoverBand(xi); }
        }
      });
      zr.off('mouseleave');
      zr.on('mouseleave', () => { currentHoverIndex = null; updateHoverBand(null); });
    };

    // initial binding after base render
    bindHoverHandlers();

    // Wire click handlers for animated drilldown using real second-level categories
    this.chartInstance.off("click");
    this.chartInstance.off("dblclick");
    this.chartInstance.on("click", (params: any) => {
      if (params && params.componentType === "series" && !this.isDrilled) {
        const clickedCategory: string = params.name;
        const built = this.buildDrillForCategory(clickedCategory);
        if (built.categories.length > 0) {
          this.isDrilled = true;
          this.drillCategory = clickedCategory;
          const objects: any = this.dataView?.metadata?.objects || {};
          const legendSettings: any = objects?.legend || {};
          const pos: string = legendSettings["position"] || "top";
          const align: string = legendSettings["alignment"] || "center"; // left|center|right
          const extra: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;
          const padding: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
          const isVertical = pos === "left" || pos === "right";
          let dTop: any = undefined, dBottom: any = undefined, dLeft: any = undefined, dRight: any = undefined;
          if (pos === "top") dTop = `${8 + extra}%`;
          if (pos === "bottom") dBottom = `${10 + extra}%`;
          if (pos === "left") { dLeft = "2%"; dTop = "5%"; }
          if (pos === "right") { dRight = "2%"; dTop = "5%"; }
          if (pos === "top" || pos === "bottom") {
            if (align === "left") dLeft = "2%";
            else if (align === "right") dRight = "2%";
            else dLeft = "center";
          }
          const dGridBottom = (pos === "bottom") ? `${15 + extra}%` : "3%";
          // Keep the same series config; hover band is drawn via graphic overlay
          const drillSeriesWithHover = (built.series || []).map((s: any) => ({
            ...s,
            emphasis: { focus: undefined, scale: false },
            stateAnimation: { duration: hoverDuration, easing: hoverEasing }
          }));
          this.chartInstance.setOption(
            {
              title: { text: `Details for ${clickedCategory}`, left: "center", top: "2%", textStyle: { fontSize: 16 as any, fontWeight: "bold", color: "#333" } },
              legend: { data: (built.series || []).map((s: any) => s.name), top: dTop, bottom: dBottom, left: dLeft, right: dRight, orient: isVertical ? "vertical" : "horizontal", padding },
              xAxis: { data: built.categories },
              series: drillSeriesWithHover as any,
              grid: { left: "3%", right: "4%", bottom: dGridBottom, containLabel: true },
              animationDurationUpdate: 800,
              animationEasingUpdate: "cubicInOut",
            } as any,
            false
          );
          // Clear any previous selection and overlays on entering drill
          this.selectedIndex = null;
          this.selectionGraphic = [];
          (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
          this.updateDrillGraphics();
          // Update hover band to new axis after drill
          currentHoverIndex = null;
          this.currentCategories = Array.isArray(built.categories) ? [...built.categories] : [];
          updateHoverBand(null);
          bindHoverHandlers();
        }
      } else if (this.isDrilled && params && params.componentType === "series") {
        // Drill level: apply persistent selection band over clicked category
        const name = params.name;
        const cats = this.currentCategories || [];
        const idx = cats.indexOf(name);
        if (idx >= 0) {
          // Toggle selection if same index clicked
          if (this.selectedIndex === idx) {
            this.selectedIndex = null;
            this.selectionGraphic = [];
            this.updateDrillGraphics();
            return;
          }
          // Guard: only draw selection if in drill level
          if (!this.isDrilled) {
            this.selectedIndex = null;
            this.selectionGraphic = [];
            (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
            this.updateDrillGraphics();
            return;
          }
          this.selectedIndex = idx;
          // Draw selection band similar to hover but using selectionStyle
          const ec: any = this.chartInstance as any;
          const centerPx = ec.convertToPixel({ xAxisIndex: 0 }, cats[idx]);
          const leftCenter = idx > 0 ? ec.convertToPixel({ xAxisIndex: 0 }, cats[idx - 1]) : undefined;
          const rightCenter = idx < cats.length - 1 ? ec.convertToPixel({ xAxisIndex: 0 }, cats[idx + 1]) : undefined;
          let halfStep = 20;
          if (leftCenter !== undefined && rightCenter !== undefined) {
            halfStep = Math.min(Math.abs(centerPx - leftCenter), Math.abs(rightCenter - centerPx)) / 2;
          } else if (rightCenter !== undefined) {
            halfStep = Math.abs(rightCenter - centerPx) / 2;
          } else if (leftCenter !== undefined) {
            halfStep = Math.abs(centerPx - leftCenter) / 2;
          }
          const coord0 = centerPx - halfStep;
          const coord1 = centerPx + halfStep;
          const grid = ec.getModel().getComponent('grid', 0);
          let topPx = 0, bottomPx = 0;
          try {
            const rect = grid?.coordinateSystem?.getRect();
            topPx = rect?.y ?? 0; bottomPx = (rect?.y ?? 0) + (rect?.height ?? 0);
          } catch {}
          const leftPx = Math.min(coord0, coord1) - expandX;
          const rightPx = Math.max(coord0, coord1) + expandX;
          const width = Math.max(0, rightPx - leftPx);
          const height = Math.max(0, (bottomPx - topPx) + expandY);
          const rectX = leftPx;
          const rectY = topPx - expandY;
          this.selectionGraphic = [{
            type: 'rect', id: 'selectionBand', z: 6,
            shape: { x: rectX, y: rectY, width, height, r: 6 },
            style: { fill: selColor, stroke: selBorderColor, lineWidth: selBorderWidth, fillOpacity: selOpacity, strokeOpacity: selOpacity },
            silent: false,
            cursor: 'pointer',
            onclick: () => {
              // toggle off on click over the band itself
              this.selectedIndex = null;
              this.selectionGraphic = [];
              this.updateDrillGraphics();
            }
          }];
          this.updateDrillGraphics();
        }
      }
    });

    this.chartInstance.on("dblclick", () => {
      if (this.isDrilled) {
        this.restoreBaseView();
      }
    });
  }

  public enumerateObjectInstances(
    options: powerbi.EnumerateVisualObjectInstancesOptions
  ): powerbi.VisualObjectInstanceEnumeration {
    const enumeration: powerbi.VisualObjectInstance[] = [];
  if (options.objectName === "dataPoint") {
      const categorical = this.dataView?.categorical;
      const valuesCols: any = categorical?.values || [];
      const groups = valuesCols?.grouped?.() as any[] | undefined;

      const pushInstance = (name: string, selector?: powerbi.data.Selector) => {
        enumeration.push({
          objectName: "dataPoint",
          displayName: name,
          properties: {
            fill: { solid: { color: this.seriesColors?.[name] ?? "#3366CC" } },
          },
          selector: selector ?? dataViewWildcard.createDataViewWildcardSelector(
            dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
          ),
        });
      };

      if (Array.isArray(groups) && groups.length > 0) {
        const measureCount = groups[0]?.values?.length || 0;
        for (const group of groups) {
          if (measureCount <= 1) {
            const sel = { data: [group.identity] } as any;
            pushInstance(group?.name ?? "Group", sel);
          } else {
            for (const mv of group.values || []) {
              const seriesName = `${group?.name ?? "Group"} · ${mv?.source?.displayName ?? "Series"}`;
              const sel = { data: [group.identity] } as any;
              pushInstance(seriesName, sel);
            }
          }
        }
      } else {
        // Sin leyenda: una serie por medida
        const measures: any[] = (valuesCols as any[]) || [];
        measures.forEach((mv: any, idx: number) => {
          const name = mv?.source?.displayName ?? `Series ${idx + 1}`;
          pushInstance(name);
        });
      }
    }

    if (options.objectName === "yAxis") {
      enumeration.push({
        objectName: "yAxis",
        displayName: "Y Axis",
        properties: {
          showLabels: (this.dataView?.metadata?.objects as any)?.yAxis?.showLabels !== false,
          showGridLines: (this.dataView?.metadata?.objects as any)?.yAxis?.showGridLines !== false,
          labelColor: { solid: { color: (this.dataView?.metadata?.objects as any)?.yAxis?.labelColor?.solid?.color || "#666666" } },
          labelSize: (this.dataView?.metadata?.objects as any)?.yAxis?.labelSize || 12,
          fontFamily: (this.dataView?.metadata?.objects as any)?.yAxis?.fontFamily || "Segoe UI, sans-serif",
          fontStyle: (this.dataView?.metadata?.objects as any)?.yAxis?.fontStyle || "regular"
        },
        selector: undefined as any
      });
    }

    if (options.objectName === "xAxis") {
      enumeration.push({
        objectName: "xAxis",
        displayName: "X Axis",
        properties: {
          showAxisLine: (this.dataView?.metadata?.objects as any)?.xAxis?.showAxisLine !== false,
          showLabels: (this.dataView?.metadata?.objects as any)?.xAxis?.showLabels !== false,
          showGridLines: (this.dataView?.metadata?.objects as any)?.xAxis?.showGridLines === true,
          labelColor: { solid: { color: (this.dataView?.metadata?.objects as any)?.xAxis?.labelColor?.solid?.color || "#666666" } },
          labelSize: (this.dataView?.metadata?.objects as any)?.xAxis?.labelSize || 12,
          rotateLabels: (this.dataView?.metadata?.objects as any)?.xAxis?.rotateLabels || 0,
          fontFamily: (this.dataView?.metadata?.objects as any)?.xAxis?.fontFamily || "Segoe UI, sans-serif",
          fontStyle: (this.dataView?.metadata?.objects as any)?.xAxis?.fontStyle || "regular"
        },
        selector: undefined as any
      });
    }

    if (options.objectName === "legend") {
      const objects: any = this.dataView?.metadata?.objects || {};
      const position = objects?.legend?.position || "top";
      const alignment = objects?.legend?.alignment || "center";
      const iconShape = objects?.legend?.iconShape || "rect";
        const extraMargin = typeof objects?.legend?.extraMargin === "number" ? objects.legend.extraMargin : 0;
      const padding = typeof objects?.legend?.padding === "number" ? objects.legend.padding : 0;
      enumeration.push({
        objectName: "legend",
        displayName: "Legend",
        properties: {
          position,
          alignment,
          iconShape,
          extraMargin,
          padding
        },
        selector: undefined as any
      });
    }

    if (options.objectName === "dataLabels") {
      const dl: any = (this.dataView?.metadata?.objects as any)?.dataLabels || {};
      enumeration.push({
        objectName: "dataLabels",
        displayName: "Data Labels",
        properties: {
          show: dl?.show !== false,
          series: dl?.series || "all",
          position: dl?.position || "auto",
          fontFamily: dl?.fontFamily || "Segoe UI",
          fontSize: dl?.fontSize || 12,
          fontStyle: dl?.fontStyle || "normal",
          color: { solid: { color: dl?.color?.solid?.color || "#444444" } },
          transparency: dl?.transparency || 0
        },
        selector: undefined as any
      });
    }
    if (options.objectName === "hoverStyle") {
      const hov: any = (this.dataView?.metadata?.objects as any)?.hoverStyle || {};
      enumeration.push({
        objectName: "hoverStyle",
        displayName: "Hover Style",
        properties: {
          color: { solid: { color: hov?.color?.solid?.color || "#cce5ff" } },
          opacity: typeof hov?.opacity === "number" ? hov.opacity : 30,
          fillOpacity: typeof hov?.fillOpacity === "number" ? hov.fillOpacity : (typeof hov?.opacity === "number" ? hov.opacity : 30),
          borderOpacity: typeof hov?.borderOpacity === "number" ? hov.borderOpacity : 50,
          duration: typeof hov?.duration === "number" ? hov.duration : 300,
          easing: hov?.easing || "cubicOut",
          borderColor: { solid: { color: hov?.borderColor?.solid?.color || "#00000020" } },
          borderWidth: typeof hov?.borderWidth === "number" ? hov.borderWidth : 0,
          expandX: typeof hov?.expandX === "number" ? hov.expandX : 8,
          expandY: typeof hov?.expandY === "number" ? hov.expandY : 8
        },
        selector: undefined as any
      });
    }
    if (options.objectName === "selectionStyle") {
      const sel: any = (this.dataView?.metadata?.objects as any)?.selectionStyle || {};
      enumeration.push({
        objectName: "selectionStyle",
        displayName: "Selection Style",
        properties: {
          color: { solid: { color: sel?.color?.solid?.color || "#0096FF" } },
          borderColor: { solid: { color: sel?.borderColor?.solid?.color || "#0078D4" } },
          borderWidth: typeof sel?.borderWidth === "number" ? sel.borderWidth : 1.5,
          opacity: typeof sel?.opacity === "number" ? sel.opacity : 40
        },
        selector: undefined as any
      });
    }
    return enumeration;
  }

  public destroy() {
    this.chartInstance.dispose();
  }

}

