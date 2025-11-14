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
// import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";
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
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private seriesColorsL1: { [key: string]: string } = {};
  private seriesColorsL2: { [key: string]: string } = {};
  private getPaletteColor(name: string): string {
    try {
      const val = (this.host as any)?.colorPalette?.getColor?.(String(name))?.value;
      return typeof val === "string" && val ? val : "#3366CC";
    } catch { return "#3366CC"; }
  }
  private getPersistedFillForCategory(catIndex: number, objectName: string, name: string): string | undefined {
    const dv = this.dataView;
    const categorical = dv?.categorical;
    const cat = categorical?.categories?.[catIndex];
    if (!cat) return undefined;
    const values = (cat.values || []) as any[];
    const objs = (cat as any).objects as any[] | undefined;
    if (!objs || objs.length === 0) return undefined;
    const want = (name === null || name === undefined || String(name) === "") ? "(Blank)" : String(name);
    for (let i = 0; i < values.length; i++) {
      const v = (values[i] === null || values[i] === undefined || String(values[i]) === "") ? "(Blank)" : String(values[i]);
      if (v === want) {
        const o = objs[i];
        const fill = o?.[objectName]?.fill?.solid?.color;
        if (typeof fill === "string" && fill) return fill;
      }
    }
    return undefined;
  }
  private dataView: powerbi.DataView | undefined;
  // Drilldown state
  private isDrilled: boolean = false;
  private baseCategories: any[] = [];
  private baseSeriesSnapshot: any[] = [];
  private baseLegendNames: string[] = [];
  private drillCategory: string | null = null;
  private drillCategoryKey: any = null;
  private hoverGraphic: any[] = [];
  private selectionGraphic: any[] = [];
  private selectedIndex: number | null = null;
  private currentCategories: any[] = [];
  // Pie-specific base data snapshot for quick restore
  private basePieData: Array<{ name: string; value: number; itemStyle?: any; selected?: boolean }> = [];
  // Animation state
  private spinAngle: number = 90; // starting angle for pie; we rotate +360 on drill for circular motion
  private sliceSelectedOffset: number = 14; // offset distance when selecting a slice in drill
  private labelLineLengthSetting: number = 20;
  private curveLineSetting: number = 0;
  private labelCurveTensionSetting: number = 0.9;
  private labelTextSpacingSetting: number = 4;
  private labelColumnOffsetSetting: number = 0;
  private labelSidePaddingSetting: number = 0;
  private centerYPercentSetting: number = 58;

  // Using ECharts native labelLine + labelLayout instead of custom drawing

  // Enhanced polar label layout with dynamic sizing and Power BI-style positioning
  private makePolarLabelLayout(radialLen: number, horizLen: number, sideMargin = 12) {
    return (params: any) => {
      try {
        const w = this.chartInstance.getWidth?.() ?? this.chartContainer.clientWidth ?? 0;
        const h = this.chartInstance.getHeight?.() ?? this.chartContainer.clientHeight ?? 0;

        const data = params?.seriesModel?.getData?.();
        const layout = data?.getItemLayout?.(params?.dataIndex);
        if (!layout) return {};

  const cx: number = layout.cx ?? w * 0.5;
  const cyPct = Math.max(0, Math.min(100, this.centerYPercentSetting || 58)) / 100;
  const cy: number = layout.cy ?? h * cyPct;
        const rOuter: number = layout.r ?? Math.min(w, h) * 0.35;
        const rInner: number = layout.r0 ?? 0; // Inner radius
        const a0: number = layout.startAngle ?? 0;
        const a1: number = layout.endAngle ?? 0;
        
        const theta = (a0 + a1) / 2; // mid-angle in rad
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Calculate slice angle in degrees to detect small slices
        const sliceAngleDeg = Math.abs((a1 - a0) * (180 / Math.PI));
        const isSmallSlice = sliceAngleDeg < 15; // Small slice detection

        // Dynamic sizing based on container dimensions so small multiples stay readable
  const scaleFactor = 1;
        const adaptiveRadialLen = Math.max(8, radialLen * scaleFactor); // Increased from 6 to 8
        const adaptiveHorizLen = Math.max(10, horizLen * scaleFactor);
        const adaptiveMargin = Math.max(10, sideMargin * scaleFactor);

    const isRightSide = cosT >= 0;

    // For donuts, the line MUST start from the outer radius, not inner
    // This is the key fix - always use rOuter for line start point
    const lineStartRadius = rOuter;
    
    // Start point of label line (from outer edge of the donut)
    const arcPoint: [number, number] = [cx + lineStartRadius * cosT, cy + lineStartRadius * sinT];

    const curveTension = Math.max(0.1, Math.min(2, this.labelCurveTensionSetting || 0.9));

        const labelW = params?.labelRect?.width || 0;
        const labelH = params?.labelRect?.height || 0;

    // Calculate initial outer point for label line
    let baseControlRadius = rOuter + (adaptiveRadialLen * curveTension);
    let outerPoint: [number, number] = [cx + baseControlRadius * cosT, cy + baseControlRadius * sinT];
    
    // Inner radius protection: check if outer point is inside the donut hole
    const outerPointDist = Math.sqrt(
      Math.pow(outerPoint[0] - cx, 2) + Math.pow(outerPoint[1] - cy, 2)
    );
    
    // If outer point is inside inner radius + safety margin, push it out
    const safeInnerBoundary = rInner * 1.2; // 20% safety margin
    let needsAdjustment = false;
    
    if (outerPointDist < safeInnerBoundary || isSmallSlice) {
      // Calculate how much we need to push out
      const targetDistance = Math.max(safeInnerBoundary, rOuter + adaptiveRadialLen);
      baseControlRadius = targetDistance + (labelH * 0.3); // Add extra space for label height
      outerPoint = [cx + baseControlRadius * cosT, cy + baseControlRadius * sinT];
      needsAdjustment = true;
    }

  const safeMinX = adaptiveMargin + Math.max(0, this.labelSidePaddingSetting || 0);
  const safeMaxX = w - (adaptiveMargin + Math.max(0, this.labelSidePaddingSetting || 0));
        const safeMinCenterY = adaptiveMargin + labelH / 2;
        const safeMaxCenterY = Math.max(safeMinCenterY, h - adaptiveMargin - labelH / 2);

        // Vertical placement: adjust if label would overlap donut
        let labelCenterY = outerPoint[1];
        
        // If we needed adjustment, also shift vertically away from center
        if (needsAdjustment) {
          // Determine if slice is in upper or lower half
          const isUpperHalf = sinT < 0; // negative sin means upper half
          
          // Push label away from center vertically
          const verticalShift = labelH * 1.0; // Full label height shift
          
          if (isUpperHalf) {
            // Upper half: push up (more negative Y)
            labelCenterY = labelCenterY - verticalShift;
          } else {
            // Lower half: push down (more positive Y)
            labelCenterY = labelCenterY + verticalShift;
          }
        }
        
        labelCenterY = Math.max(safeMinCenterY, Math.min(labelCenterY, safeMaxCenterY));
        const labelTop = labelCenterY - labelH / 2;

  const lineLengthSetting = Math.max(6, this.labelLineLengthSetting || adaptiveHorizLen);

        // Column target pushes labels away from donut similar to the shared references
        // Add extra push for labels that might overlap with inner radius
        const extraPush = rInner > 0 ? Math.max(0, rInner * 0.3) : 0; // 30% of inner radius as safety
  const desiredOffset = rOuter + adaptiveRadialLen + lineLengthSetting + (this.labelColumnOffsetSetting || 0) + extraPush;
        let labelLeft: number;

        if (isRightSide) {
          const desiredLeft = cx + desiredOffset;
          const maxLeft = Math.min(safeMaxX - labelW, w - adaptiveMargin - labelW);
          labelLeft = Math.min(Math.max(desiredLeft, arcPoint[0] + 6), maxLeft);
        } else {
          const desiredRight = cx - desiredOffset;
          const minRight = Math.max(safeMinX + labelW, adaptiveMargin + labelW);
          let anchorRight = Math.max(Math.min(desiredRight, arcPoint[0] - 6), minRight);
          labelLeft = anchorRight - labelW;
          if (labelLeft < safeMinX) {
            labelLeft = safeMinX;
            anchorRight = labelLeft + labelW;
          }
        }

        labelLeft = Math.max(safeMinX, Math.min(labelLeft, safeMaxX - labelW));

        const lineEndX = isRightSide ? labelLeft : labelLeft + labelW;
        const lineEndY = labelCenterY;

        // Calculate optimal angle for line start based on label position
        // This creates dynamic connection points like native Power BI
        const targetAngle = Math.atan2(lineEndY - cy, lineEndX - cx);
        
        // Clamp the angle within the slice's angular range
        let optimalAngle = targetAngle;
        if (a0 < a1) {
          optimalAngle = Math.max(a0, Math.min(targetAngle, a1));
        } else {
          // Handle wrap-around case
          if (targetAngle >= a0 || targetAngle <= a1) {
            optimalAngle = targetAngle;
          } else {
            optimalAngle = Math.abs(targetAngle - a0) < Math.abs(targetAngle - a1) ? a0 : a1;
          }
        }
        
        const optimalCos = Math.cos(optimalAngle);
        const optimalSin = Math.sin(optimalAngle);
        
        // Recalculate arcPoint with optimal angle
        const dynamicArcPoint: [number, number] = [
          cx + lineStartRadius * optimalCos, 
          cy + lineStartRadius * optimalSin
        ];

        const controlPoint: [number, number] = [
          cx + (rOuter + adaptiveRadialLen * Math.max(0.2, Math.min(1.5, curveTension * 0.9))) * optimalCos,
          cy + (rOuter + adaptiveRadialLen * Math.max(0.2, Math.min(1.5, curveTension * 0.9))) * optimalSin
        ];

        const linePoints: Array<[number, number]> = [
          dynamicArcPoint,
          controlPoint,
          [lineEndX, lineEndY]
        ];

        const textX = isRightSide ? labelLeft : labelLeft + labelW;

        return {
          x: textX,
          y: labelCenterY,
          align: isRightSide ? "left" : "right",
          verticalAlign: "middle",
          labelLinePoints: linePoints,
          moveOverlap: "shiftY",
          hideOverlap: true,
          labelRect: {
            x: labelLeft,
            y: labelTop,
            width: labelW,
            height: labelH
          }
        } as any;
      } catch {
        return {};
      }
    };
  }

  private normalizeLegendShape(value: any): "default" | "circle" | "square" | "rhombus" | "triangle" | "triangleDown" {
    if (typeof value !== "string") {
      return "default";
    }
    const lower = value.toLowerCase();
    switch (lower) {
      case "circle":
        return "circle";
      case "square":
        return "square";
      case "rect":
      case "rectangle":
        return "default";
      case "rhombus":
      case "diamond":
        return "rhombus";
      case "triangle":
        return "triangle";
      case "triangledown":
      case "triangle-down":
      case "triangle_down":
      case "triangle (upside down)":
        return "triangleDown";
      default:
        return "default";
    }
  }

  private legendIconForShape(
    shape: "default" | "circle" | "square" | "rhombus" | "triangle" | "triangleDown",
    size: number
  ): { icon?: string; width: number; height: number } {
    const base = Math.max(4, Number.isFinite(size) ? size : 14);
    switch (shape) {
      case "circle":
        return { icon: "circle", width: base, height: base };
      case "square":
        return { icon: "rect", width: base, height: base };
      case "rhombus":
        return { icon: "diamond", width: base, height: base };
      case "triangle":
        return { icon: "triangle", width: base, height: base };
      case "triangleDown":
        return { icon: "path://M0,0 L10,0 L5,10 Z", width: base, height: base };
      case "default":
      default:
        return { icon: undefined, width: Math.max(4, base * 1.4), height: base };
    }
  }

  // Restore to base (drill-up)
  private restoreBaseView() {
    if (!this.chartInstance) return;
    const objects: any = this.dataView?.metadata?.objects || {};
    const legendSettings: any = objects?.legend || {};
    const legendShow: boolean = legendSettings["show"] !== false;
    const pos: string = legendSettings["position"] || "top";
    const align: string = legendSettings["alignment"] || "center"; // left|center|right
    const extra: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;
    const padding: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
    const detailShape = this.normalizeLegendShape(legendSettings["iconShape"]);
    const detailMarkerSize: number = typeof legendSettings["markerSize"] === "number" ? legendSettings["markerSize"] : 14;
    const detailFontSize: number = typeof legendSettings["fontSize"] === "number" ? legendSettings["fontSize"] : 12;
    const detailIconConfig = this.legendIconForShape(detailShape, detailMarkerSize);
    const isVertical = pos === "left" || pos === "right";
    let legendTop: any = undefined, legendBottom: any = undefined, legendLeft: any = undefined, legendRight: any = undefined;
    if (pos === "top") legendTop = `${5 + extra}%`;
    if (pos === "bottom") legendBottom = `${5 + extra}%`;
    if (pos === "left") { legendLeft = "2%"; legendTop = "5%"; }
    if (pos === "right") { legendRight = "2%"; legendTop = "5%"; }
    if (pos === "top" || pos === "bottom") {
      if (align === "left") legendLeft = "2%";
      else if (align === "right") legendRight = "2%";
      else legendLeft = "center";
    }

    const labelLineLength = Math.max(4, this.labelLineLengthSetting || 18);
    const labelLineLength2 = Math.max(6, labelLineLength + 6);
    const labelLineSmooth = Math.max(0, Math.min(1, this.curveLineSetting || this.labelCurveTensionSetting || 0));
    const labelLineHeight = Math.max(12, 12 + this.labelTextSpacingSetting);
    const labelSideMargin = Math.max(0, this.labelSidePaddingSetting || 0);
    const seriesLayoutRadial = labelLineLength;
    const seriesLayoutHorizontal = Math.max(6, Math.round(seriesLayoutRadial * 1.4));
    const labelLineBaseConfig = {
      show: true,
      length: labelLineLength,
      length2: labelLineLength2,
      smooth: labelLineSmooth > 0 ? labelLineSmooth : false,
      lineStyle: { width: 0.8, color: '#BFBFBF', type: 'solid' }
    };

    // Data Labels styling and formatter (match base update)
    const dl: any = objects?.dataLabels || {};
    const dlShow: boolean = dl["show"] !== false;
    const dlColor: string = (dl["color"] as any)?.solid?.color || "#444";
    const dlFontFamily: string = (dl["fontFamily"] as string) || "Segoe UI";
    const dlFontSize: number = typeof dl["fontSize"] === "number" ? dl["fontSize"] : 12;
    const dlFontStyleSetting: string = (dl["fontStyle"] as string) || "normal";
    const dlFontWeight: any = dlFontStyleSetting === "bold" ? "bold" : "normal";
    const dlFontStyle: any = dlFontStyleSetting === "italic" ? "italic" : "normal";
    const dlTransparency: number = typeof dl["transparency"] === "number" ? dl["transparency"] : 0;
    const dlOpacity: number = Math.max(0, Math.min(1, 1 - dlTransparency / 100));
    const dlShowBlankAs: string = typeof dl["showBlankAs"] === "string" ? dl["showBlankAs"] : "";
    const dlTreatZeroAsBlank: boolean = dl["treatZeroAsBlank"] === true;
    const dlDisplayUnit: string = dl["displayUnit"] || "auto";
    const dlValueDecimals: number = typeof dl["valueDecimals"] === "number" ? dl["valueDecimals"] : 2;
    const dlValueType: string = (dl["valueType"] as string) || "auto";

    const formatNumberWithUnitRestore = (raw: any, unit: string, decimals: number, valueType: string): string => {
      if (raw === null || raw === undefined || raw === "") return "";
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return String(raw);

      let divisor = 1; let suffix = "";
      const absn = Math.abs(n);
      if (unit === "auto") {
        if (absn >= 1_000_000_000) { divisor = 1_000_000_000; suffix = "B"; }
        else if (absn >= 1_000_000) { divisor = 1_000_000; suffix = "M"; }
        else if (absn >= 1_000) { divisor = 1_000; suffix = "K"; }
      } else if (unit === "thousand") { divisor = 1_000; suffix = "K"; }
      else if (unit === "million") { divisor = 1_000_000; suffix = "M"; }
      else if (unit === "billion") { divisor = 1_000_000_000; suffix = "B"; }

      let valueForFormat = n / divisor;
      const style = valueType === "currency" ? "currency" : (valueType === "percent" ? "percent" : "decimal");
      if (style === "percent") {
        valueForFormat = Math.abs(valueForFormat) <= 1 ? valueForFormat : valueForFormat / 100;
      }
      const d = Math.max(0, Math.min(9, Math.floor(decimals)));
      try {
        const nf = new Intl.NumberFormat(undefined, {
          style: style as any,
          ...(style === "currency" ? { currency: "USD" } : {}),
          minimumFractionDigits: d,
          maximumFractionDigits: d
        });
        const base = nf.format(valueForFormat);
        return suffix ? `${base}${suffix}` : base;
      } catch {
        const fixed = valueForFormat.toFixed(d);
        return suffix ? `${fixed}${suffix}` : fixed;
      }
    };

    const labelFormatterRestore = (p: any) => {
      const v = p?.value;
      if (v === null || v === undefined || v === "") return dlShowBlankAs;
      const numeric = typeof v === "number" ? v : Number(v);
      if (dlTreatZeroAsBlank && Number.isFinite(numeric) && numeric === 0) {
        return dlShowBlankAs ?? "";
      }

      const name = p?.name ?? "";
      const hasNumeric = v !== null && v !== undefined && v !== "" && Number.isFinite(numeric);
      // Use global Data Labels settings only
      const unit = dlDisplayUnit;
      const dec = dlValueDecimals;
      const vtype = dlValueType;
      const valueText = hasNumeric ? formatNumberWithUnitRestore(numeric, unit, dec, vtype) : "";
      return hasNumeric ? `${name} ${valueText}` : name;
    };

  // Restore base donut (pie) view
  const w0 = this.chartInstance.getWidth?.() ?? this.chartContainer.clientWidth ?? 0;
  const h0 = this.chartInstance.getHeight?.() ?? this.chartContainer.clientHeight ?? 0;
  // Read spacing options (inner and ring width) with bounds and sensible defaults
  const spacing0: any = objects?.spacing || {};
  const clampNum = (v:number,min:number,max:number)=> Math.max(min, Math.min(max, v));
  const inner0: number = clampNum(typeof spacing0.innerRadiusPercent === 'number' ? spacing0.innerRadiusPercent : 24, 5, 90);
  const ring0: number = clampNum(typeof spacing0.ringWidthPercent === 'number' ? spacing0.ringWidthPercent : 58, 4, 90);
  const outer0: number = clampNum(inner0 + ring0, inner0 + 1, 98);
  const centerY0: number = clampNum(typeof spacing0.centerYPercent === 'number' ? spacing0.centerYPercent : this.centerYPercentSetting || 58, 0, 100);
    const smallMode0 = w0 < 260 || h0 < 220;
    const position0 = smallMode0 ? "inside" : "outside";
    this.chartInstance.setOption(
      {
        title: { text: "", left: "center", top: "5%" },
        legend: {
          show: legendShow,
          data: (this.basePieData || []).map(d => d.name),
          top: legendTop,
          bottom: legendBottom,
          left: legendLeft,
          right: legendRight,
          orient: isVertical ? "vertical" : "horizontal",
          padding,
          itemWidth: detailIconConfig.width,
          itemHeight: detailIconConfig.height,
          textStyle: { fontSize: detailFontSize },
          ...(detailIconConfig.icon ? { icon: detailIconConfig.icon } : {})
        },
        series: [
          // Outer rim for visual style
          {
            name: "rim",
            type: "pie",
            silent: true,
            z: 0,
            radius: [`${outer0}%`, `${Math.min(outer0 + 2, 98)}%`],
            center: ["50%", `${centerY0}%`],
            label: { show: false },
            labelLine: { show: false },
            data: [{ value: 1, itemStyle: { color: "transparent", borderColor: "#C7C9CC", borderWidth: 2 } }]
          } as any,
          // Main donut
          {
            name: "",
            type: "pie",
            z: 1,
            radius: [`${inner0}%`, `${outer0}%`],
            center: ["50%", `${centerY0}%`],
            selectedMode: "single",
            selectedOffset: this.sliceSelectedOffset,
            startAngle: this.spinAngle % 360,
            animationType: "expansion",
            universalTransition: { enabled: true },
            avoidLabelOverlap: true,
            minShowLabelAngle: 8,
            // labelLayout: this.makePolarLabelLayout(seriesLayoutRadial, seriesLayoutHorizontal, labelSideMargin + 4),
            data: (this.basePieData as any).map((d: any) => ({ ...d, itemStyle: { ...(d.itemStyle||{}), borderColor: "#FFFFFF", borderWidth: 2 } })),
            label: {
              show: dlShow,
              position: "outside",
              color: dlColor,
              fontFamily: dlFontFamily,
              fontSize: dlFontSize,
              fontStyle: dlFontStyle,
              fontWeight: dlFontWeight,
              formatter: labelFormatterRestore,
              opacity: dlOpacity,
              overflow: "break",
              lineHeight: labelLineHeight,
              width: Math.max(80, Math.floor(w0 * 0.25)) as any
            },
            labelLine: labelLineBaseConfig,
            // Goal: like ZoomCharts, keep every label at the same radial distance while allowing vertical shifts
            labelLayout: this.makePolarLabelLayout(seriesLayoutRadial, seriesLayoutHorizontal, labelSideMargin),
            emphasis: { scale: true }
          } as any
        ]
      } as any,
      true
    );

    // Using ECharts native labelLine + labelLayout (no custom drawing needed)

    this.isDrilled = false;
    this.drillCategory = null;
    this.drillCategoryKey = null;
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

  private drawSelectionBand(
    idx: number,
    expandX: number,
    expandY: number,
    selColor: string,
    selBorderColor: string,
    selBorderWidth: number,
    selOpacity: number
  ): void {
    if (!this.isDrilled) {
      this.selectedIndex = null;
      this.selectionGraphic = [];
      (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
      this.updateDrillGraphics();
      return;
    }

    const cats = this.currentCategories || [];
    if (!Array.isArray(cats) || idx < 0 || idx >= cats.length) {
      this.selectedIndex = null;
      this.selectionGraphic = [];
      (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
      this.updateDrillGraphics();
      return;
    }

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
    const grid = ec.getModel().getComponent("grid", 0);
    let topPx = 0;
    let bottomPx = 0;
    try {
      const rect = grid?.coordinateSystem?.getRect();
      topPx = rect?.y ?? 0;
      bottomPx = (rect?.y ?? 0) + (rect?.height ?? 0);
    } catch {}
    const leftPx = Math.min(coord0, coord1) - expandX;
    const rightPx = Math.max(coord0, coord1) + expandX;
    const width = Math.max(0, rightPx - leftPx);
    const height = Math.max(0, bottomPx - topPx + expandY);
    const rectX = leftPx;
    const rectY = topPx - expandY;

    this.selectionGraphic = [
      {
        type: "rect",
        id: "selectionBand",
        z: 6,
        shape: { x: rectX, y: rectY, width, height, r: 6 },
        style: {
          fill: selColor,
          stroke: selBorderColor,
          lineWidth: selBorderWidth,
          fillOpacity: selOpacity,
          strokeOpacity: selOpacity,
        },
        silent: false,
        cursor: "pointer",
        onclick: () => {
          this.selectedIndex = null;
          this.selectionGraphic = [];
          this.updateDrillGraphics();
        },
      },
    ];
    this.updateDrillGraphics();
  }

  private buildDrillForCategory(clickedCategoryLabel: any, categoryKey?: any): { categories: any[]; series: any[] } {
    const dv = this.dataView;
    const categorical = dv?.categorical;
    const cat1 = categorical?.categories?.[0]?.values || [];
    const cat2 = categorical?.categories?.[1]?.values || [];
    const valuesCols: any = categorical?.values || [];
    const groups = valuesCols?.grouped?.() as any[] | undefined;
    const rowCount = (cat1 as any[]).length;
    const idxs: number[] = [];
    const matchesCategory = (value: any) => {
      if (categoryKey !== undefined && categoryKey !== null) {
        if (value === categoryKey) {
          return true;
        }
        const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function")
          ? value.valueOf()
          : value;
        const keyPrimitive = (categoryKey !== null && categoryKey !== undefined && typeof categoryKey.valueOf === "function")
          ? categoryKey.valueOf()
          : categoryKey;
        if (valuePrimitive === keyPrimitive) {
          return true;
        }
        if (String(valuePrimitive) === String(keyPrimitive)) {
          return true;
        }
      }
      if (value === clickedCategoryLabel) {
        return true;
      }
      if (value !== null && value !== undefined && clickedCategoryLabel !== null && clickedCategoryLabel !== undefined) {
        return String(value) === String(clickedCategoryLabel);
      }
      return false;
    };
    for (let i = 0; i < rowCount; i++) {
      if (matchesCategory((cat1 as any[])[i])) idxs.push(i);
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
  const dlShowBlankAs: string = (typeof dl["showBlankAs"] === "string") ? dl["showBlankAs"] : "";
  const dlTreatZeroAsBlank: boolean = dl["treatZeroAsBlank"] === true;

    // Extract labelVisibility for drill level
    let labelVisibilityValues: any[] | null = null;
    for (let i = 0; i < valuesCols.length; i++) {
      const col = valuesCols[i];
      if (col?.source?.roles?.labelVisibility) {
        labelVisibilityValues = col.values as any[];
        break;
      }
    }

    // Build labelVisibility lookup map for drill level: aggregate by cat2
    const labelVisibilityMapDrill = new Map<any, number>();
    if (labelVisibilityValues && Array.isArray(labelVisibilityValues)) {
      for (const c2Val of cat2Order) {
        let sum = 0;
        for (const i of idxs) {
          if ((cat2 as any[])[i] === c2Val) {
            const visVal = labelVisibilityValues[i];
            sum += (visVal === null || visVal === undefined) ? 0 : Number(visVal);
          }
        }
        labelVisibilityMapDrill.set(c2Val, sum);
      }
    }

    const labelFormatterDrill = (params: any) => {
      if (labelVisibilityMapDrill.size > 0) {
        const catName = params.name;
        const visValue = labelVisibilityMapDrill.get(catName) ?? 0;
        if (visValue <= 0) {
          return "";
        }
      }
      const v = params?.value;
      if (v === null || v === undefined || v === "") {
        return dlShowBlankAs;
      }
      if (dlTreatZeroAsBlank) {
        const numeric = typeof v === "number" ? v : Number(v);
        if (!Number.isNaN(numeric) && numeric === 0) {
          return dlShowBlankAs ?? "";
        }
      }
      return v as any;
    };

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
        formatter: labelFormatterDrill,
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
          const color = this.seriesColorsL1?.[name] || "#6688cc";
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
            const color = this.seriesColorsL1?.[name] || "#6688cc";
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
  const color = this.seriesColorsL1?.[name] || "#6688cc";
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

  // Build drill pie data for a clicked Category[0]: aggregates Category[1] values
  private buildDrillPieData(clickedCategoryLabel: any, categoryKey?: any): Array<{ name: string; value: number }> {
    const dv = this.dataView;
    const categorical = dv?.categorical;
    const cat1 = categorical?.categories?.[0]?.values || [];
    const cat2 = categorical?.categories?.[1]?.values || [];
    const valuesCols: any = categorical?.values || [];
    const rowCount = (cat1 as any[]).length;

    const matchesCategory = (value: any) => {
      if (categoryKey !== undefined && categoryKey !== null) {
        const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function")
          ? value.valueOf() : value;
        const keyPrimitive = (categoryKey !== null && categoryKey !== undefined && typeof categoryKey.valueOf === "function")
          ? categoryKey.valueOf() : categoryKey;
        if (valuePrimitive === keyPrimitive || String(valuePrimitive) === String(keyPrimitive)) return true;
      }
      if (value === clickedCategoryLabel) return true;
      if (value !== null && value !== undefined && clickedCategoryLabel !== null && clickedCategoryLabel !== undefined) {
        return String(value) === String(clickedCategoryLabel);
      }
      return false;
    };

    const idxs: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      if (matchesCategory((cat1 as any[])[i])) idxs.push(i);
    }
    const cat2Order: any[] = [];
    const seen = new Set<any>();
    for (const i of idxs) {
      const v = (cat2 as any[])[i];
      if (!seen.has(v)) { seen.add(v); cat2Order.push(v); }
    }

    const toNumber = (x: any) => (x === null || x === undefined || x === "") ? 0 : (typeof x === "number" ? x : Number(x));
    const totals = new Map<any, number>();

    // Helper to add from a column source
    const addFromSource = (src: any[]) => {
      for (const c2 of cat2Order) {
        let s = 0;
        for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]);
        totals.set(c2, (totals.get(c2) || 0) + s);
      }
    };

    const groups = (valuesCols as any)?.grouped?.() as any[] | undefined;
    if (Array.isArray(groups) && groups.length > 0) {
      const measureCount = groups[0]?.values?.length || 0;
      for (const g of groups) {
        if (measureCount <= 1) addFromSource(g?.values?.[0]?.values || []);
        else for (const mv of g.values || []) addFromSource(mv?.values || []);
      }
    } else {
      for (const mv of (valuesCols as any[]) || []) addFromSource(mv?.values || []);
    }

    return cat2Order.map((name) => ({ name: String(name), value: totals.get(name) || 0 }));
  }

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.chartContainer = document.createElement("div");
    this.chartContainer.style.width = "100%";
    this.chartContainer.style.height = "100%";
    options.element.appendChild(this.chartContainer);
    this.chartInstance = echarts.init(this.chartContainer);
    this.host = options.host;
    this.formattingSettingsService = new FormattingSettingsService();
    this.formattingSettings = new VisualFormattingSettingsModel();
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
    const dataView = options.dataViews && options.dataViews[0];
    this.dataView = dataView;
    if (!dataView || !dataView.categorical) {
      this.chartInstance.clear();
      return;
    }

    // Populate formatting settings from dataView
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

    const labelTuneObj: any = (dataView.metadata?.objects as any)?.labelTuning || {};
    const clampNumeric = (value: any, fallback: number, min: number, max: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value))
        : fallback;
        this.labelLineLengthSetting = clampNumeric(labelTuneObj.lineLength, 20, 4, 160); // Default line length
  this.curveLineSetting = clampNumeric(labelTuneObj.curveTension, 0, 0, 1);
  this.labelCurveTensionSetting = clampNumeric(labelTuneObj.curveTension, 0.9, 0.1, 2.5);
  this.labelTextSpacingSetting = clampNumeric(labelTuneObj.textSpacing, 4, 0, 20);
  this.labelColumnOffsetSetting = clampNumeric(labelTuneObj.columnOffset, 0, -120, 240);
  this.labelSidePaddingSetting = clampNumeric(labelTuneObj.sidePadding, 0, 0, 120);

    const categorical = dataView.categorical;
    const categoryCols = categorical.categories || [];
    const cat1All = categoryCols[0]?.values || [];
    const cat2All = categoryCols[1]?.values || [];
    const rowCount = cat1All.length || 0;

    // Extract optional labelVisibility measure (DAX expression for showing/hiding labels)
    const valuesColsAll: any = categorical.values || [];
    let labelVisibilityValues: any[] | null = null;
    for (let i = 0; i < valuesColsAll.length; i++) {
      const col = valuesColsAll[i];
      if (col?.source?.roles?.labelVisibility) {
        labelVisibilityValues = col.values as any[];
        break;
      }
    }

    // Base categories for first level (Category[0])
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

    // We'll build a single pie series: each slice is a Category[0] with aggregated total across all measures/groups
    const legendNames: string[] = categories.map(c => (c === null || c === undefined || String(c) === "") ? "(Blank)" : String(c));

    // Data Labels settings
    const dl: any = (dataView.metadata?.objects as any)?.dataLabels || {};
    const dlShow: boolean = dl["show"] !== false;
    const dlPositionSetting: string = dl["position"] || "auto";
    const dlShowBlankAs: string = (typeof dl["showBlankAs"] === "string") ? dl["showBlankAs"] : "";
    const dlTreatZeroAsBlank: boolean = dl["treatZeroAsBlank"] === true;
    const dlDisplayUnit: string = dl["displayUnit"] || "auto";
    const dlValueDecimals: number = typeof dl["valueDecimals"] === "number" ? dl["valueDecimals"] : 2;
    const dlValueType: string = (dl["valueType"] as string) || "auto";
    const dlColor: string = (dl["color"] as any)?.solid?.color || "#444";
    const dlFontFamily: string = (dl["fontFamily"] as string) || "Segoe UI";
    const dlFontSize: number = typeof dl["fontSize"] === "number" ? dl["fontSize"] : 12;
    const dlFontStyleSetting: string = (dl["fontStyle"] as string) || "normal"; // normal|bold|italic
    const dlFontWeight: any = dlFontStyleSetting === "bold" ? "bold" : "normal";
    const dlFontStyle: any = dlFontStyleSetting === "italic" ? "italic" : "normal";
    const dlTransparency: number = typeof dl["transparency"] === "number" ? dl["transparency"] : 0;
    const dlOpacity: number = Math.max(0, Math.min(1, 1 - (dlTransparency / 100)));

    const formatNumberWithUnit = (raw: any, unit: string, decimals: number, valueType: string): string => {
      if (raw === null || raw === undefined || raw === "") return "";
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return String(raw);

      // Units
      let divisor = 1; let suffix = "";
      const absn = Math.abs(n);
      if (unit === "auto") {
        if (absn >= 1_000_000_000) { divisor = 1_000_000_000; suffix = "B"; }
        else if (absn >= 1_000_000) { divisor = 1_000_000; suffix = "M"; }
        else if (absn >= 1_000) { divisor = 1_000; suffix = "K"; }
      } else if (unit === "thousand") { divisor = 1_000; suffix = "K"; }
      else if (unit === "million") { divisor = 1_000_000; suffix = "M"; }
      else if (unit === "billion") { divisor = 1_000_000_000; suffix = "B"; }
      // value for formatting
      let valueForFormat = n / divisor;
      // Value type handling (decimal/currency/percent)
      const style = valueType === "currency" ? "currency" : (valueType === "percent" ? "percent" : "decimal");
      if (style === "percent") {
        // If already absolute, convert to fraction; if small, assume fraction
        valueForFormat = Math.abs(valueForFormat) <= 1 ? valueForFormat : valueForFormat / 100;
      }
      const d = Math.max(0, Math.min(9, Math.floor(decimals)));
      try {
        const nf = new Intl.NumberFormat(undefined, {
          style: style as any,
          ...(style === "currency" ? { currency: "USD" } : {}),
          minimumFractionDigits: d,
          maximumFractionDigits: d
        });
        const base = nf.format(valueForFormat);
        return suffix ? `${base}${suffix}` : base;
      } catch {
        const fixed = valueForFormat.toFixed(d);
        return suffix ? `${fixed}${suffix}` : fixed;
      }
    };

    // Drill-level Data Labels (general) - optional overrides
    const dld: any = (dataView.metadata?.objects as any)?.dataLabelsDrill || {};
    const dlDisplayUnitDrill: string = (dld["displayUnit"] as string) || dlDisplayUnit;
    const dlValueDecimalsDrill: number = typeof dld["valueDecimals"] === "number" ? dld["valueDecimals"] : dlValueDecimals;
    const dlValueTypeDrill: string = (dld["valueType"] as string) || dlValueType;

    // Build labelVisibility lookup map: aggregate by category
    const labelVisibilityMap = new Map<any, number>();
    if (labelVisibilityValues && Array.isArray(labelVisibilityValues)) {
      for (const cat1Val of uniqueCat1) {
        const idxs = idxsByCat1.get(cat1Val) || [];
        let sum = 0;
        for (const idx of idxs) {
          const visVal = labelVisibilityValues[idx];
          sum += (visVal === null || visVal === undefined) ? 0 : Number(visVal);
        }
        // If sum > 0, show label; otherwise hide
        labelVisibilityMap.set(cat1Val, sum);
      }
    }

    const labelFormatterWithDAX = (params: any) => {
      // If labelVisibility measure is active, check it first
      if (labelVisibilityMap.size > 0) {
        const catName = params.name;
        const visValue = labelVisibilityMap.get(catName) ?? 0;
        if (visValue <= 0) {
          return "";
        }
      }
      const v = params?.value;
      if (v === null || v === undefined || v === "") {
        return dlShowBlankAs;
      }
      if (dlTreatZeroAsBlank) {
        const numeric = typeof v === "number" ? v : Number(v);
        if (!Number.isNaN(numeric) && numeric === 0) {
          return dlShowBlankAs ?? "";
        }
      }
      return v as any;
    };

    const buildLabelText = (p: any): string => {
      const base = labelFormatterWithDAX(p);
      if (base === "") return "";

      const name = p?.name ?? "";
      const raw = p?.value;
      const n = typeof raw === "number" ? raw : Number(raw);
      const hasNumeric = raw !== null && raw !== undefined && raw !== "" && Number.isFinite(n);
      // Use global Data Labels settings (no per-category overrides at base level)
      const unit = dlDisplayUnit;
      const dec = dlValueDecimals;
      const vtype = dlValueType;
      const valueText = hasNumeric ? formatNumberWithUnit(n, unit, dec, vtype) : "";
      return hasNumeric ? `${name} ${valueText}` : name;
    };

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

    // Color helpers replaced with explicit palette + persisted read

    const resolveCategoryColor = (categoryName: string, forDrill = false): string => {
      const name = (categoryName === null || categoryName === undefined || String(categoryName) === "") ? "(Blank)" : String(categoryName);
      const cache = forDrill ? this.seriesColorsL2 : this.seriesColorsL1;
      const persisted = this.getPersistedFillForCategory(forDrill ? 1 : 0, forDrill ? "dataPointDrill" : "dataPoint", name);
      const color = persisted || cache[name] || this.getPaletteColor(name);
      cache[name] = color;
      return color;
    };

    const toNumber = (x: any) =>
      x === null || x === undefined || x === "" ? 0 : typeof x === "number" ? x : Number(x);

    // Aggregate totals per Category[0] across all values columns/groups
    const totalsByCat1 = new Map<any, number>();
    const addFromSource = (src: any[]) => {
      for (const c of uniqueCat1) {
        const idxs = idxsByCat1.get(c) || [];
        let s = 0; for (const i of idxs) s += toNumber(src[i]);
        totalsByCat1.set(c, (totalsByCat1.get(c) || 0) + s);
      }
    };
    if (Array.isArray(groups) && groups.length > 0) {
      const measureCount = groups[0]?.values?.length || 0;
      for (const g of groups) {
        if (measureCount <= 1) addFromSource(g?.values?.[0]?.values || []);
        else for (const mv of g.values || []) addFromSource(mv?.values || []);
      }
    } else {
      for (const mv of (valuesCols as any[]) || []) addFromSource(mv?.values || []);
    }

    // Build pie data with colors per category
    const basePieData = categories.map((c) => {
      const name = (c === null || c === undefined || String(c) === "") ? "(Blank)" : String(c);
      const value = totalsByCat1.get(c) || 0;
      return {
        name,
        value,
        itemStyle: { color: resolveCategoryColor(name, false) }
      };
    });

    // Guardas básicas
    if (!categories.length || !basePieData.length) {
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

  // For pie we rely on built-in emphasis and selection

  // Axis settings are not used for pie

  const legendSettings: any = (dataView.metadata?.objects as any)?.legend || {};
  const legendShow: boolean = legendSettings["show"] !== false;
  const legendPosition: string = legendSettings["position"] || "top";
  const legendAlignment: string = legendSettings["alignment"] || "center"; // left | center | right
  const legendShape = this.normalizeLegendShape(legendSettings["iconShape"]);
  const legendMarkerSize: number = typeof legendSettings["markerSize"] === "number" ? legendSettings["markerSize"] : 14;
  const legendFontSize: number = typeof legendSettings["fontSize"] === "number" ? legendSettings["fontSize"] : 12;
  const legendIconConfig = this.legendIconForShape(legendShape, legendMarkerSize);
  const legendIcon = legendIconConfig.icon;
  const legendItemWidth = legendIconConfig.width;
  const legendItemHeight = legendIconConfig.height;
  const legendPadding: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
  const legendExtraMargin: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;

  // Selection Style settings (for clicks in drill level)
  const selObj: any = (dataView.metadata?.objects as any)?.selectionStyle || {};
  const selColor: string = getSolidColor(selObj?.color?.solid?.color || "#0096FF");
  const selBorderColor: string = getSolidColor(selObj?.borderColor?.solid?.color || "#0078D4");
  const selBorderWidth: number = typeof selObj?.borderWidth === "number" ? selObj.borderWidth : 1.5;
  const selOpacityPct: number = typeof selObj?.opacity === "number" ? selObj.opacity : 40;
  const selOpacity: number = Math.max(0, Math.min(1, selOpacityPct / 100));

  const drillHeaderSettings: any = (dataView.metadata?.objects as any)?.drillHeader || {};
  const drillHeaderShow: boolean = drillHeaderSettings["show"] !== false;

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

  // no grid for pie

    const pieLabelPosition = (() => {
      switch (dlPositionSetting) {
        case "insideCenter":
        case "insideBase":
        case "insideEnd":
          return "inside";
        case "outsideEnd":
        case "auto":
        default:
          return "outside";
      }
    })();

  const w = this.chartInstance.getWidth?.() ?? this.chartContainer.clientWidth ?? 0;
  const h = this.chartInstance.getHeight?.() ?? this.chartContainer.clientHeight ?? 0;
  // Spacing (inner radius and ring width)
  const spacingObj: any = (dataView.metadata?.objects as any)?.spacing || {};
  const clampPct = (v:number,min:number,max:number)=> Math.max(min, Math.min(max, v));
  const innerR: number = clampPct(typeof spacingObj.innerRadiusPercent === 'number' ? spacingObj.innerRadiusPercent : 24, 5, 90);
  const ringW: number = clampPct(typeof spacingObj.ringWidthPercent === 'number' ? spacingObj.ringWidthPercent : 58, 4, 90);
  const outerR: number = clampPct(innerR + ringW, innerR + 1, 98);
  this.centerYPercentSetting = clampPct(typeof spacingObj.centerYPercent === 'number' ? spacingObj.centerYPercent : 58, 0, 100);
  const labelLineLengthMain = Math.max(4, this.labelLineLengthSetting || 18);
  const labelLineLength2Main = Math.max(6, labelLineLengthMain + 6);
  const labelLineSmoothMain = Math.max(0, Math.min(1, this.curveLineSetting || this.labelCurveTensionSetting || 0));
  const labelLineHeightMain = Math.max(12, 12 + this.labelTextSpacingSetting);
  const labelSideMarginMain = Math.max(0, this.labelSidePaddingSetting || 0);
  const seriesLayoutRadialMain = labelLineLengthMain;
  const seriesLayoutHorizontalMain = Math.max(6, Math.round(seriesLayoutRadialMain * 1.4));
    const smallMode = w < 260 || h < 220;
    const option: echarts.EChartsCoreOption = {
      tooltip: { trigger: "item", formatter: (p: any) => `${p.name}<br/>${p.value} (${p.percent}%)` },
      title: {
        text: (drillHeaderShow && this.isDrilled && this.drillCategory)
          ? `Details for ${this.drillCategory}`
          : "",
        left: "center",
        top: this.isDrilled ? "2%" : "5%",
        textStyle: { fontSize: 16 as any, fontWeight: "bold", color: "#333" }
      },
      legend: {
        show: legendShow,
        type: "plain",
        orient: isVertical ? "vertical" : "horizontal",
        top: legendTop,
        bottom: legendBottom,
        left: legendLeft,
        right: legendRight,
        padding: legendPadding,
        itemWidth: legendItemWidth,
        itemHeight: legendItemHeight,
        textStyle: { fontSize: legendFontSize },
        ...(legendIcon ? { icon: legendIcon } : {}),
        data: legendNames
      },
      series: [
        // Rim
        {
          name: "rim",
          type: "pie",
          silent: true,
          z: 0,
          radius: [`${outerR}%`, `${Math.min(outerR + 2, 98)}%`],
          center: ["50%", `${this.centerYPercentSetting}%`],
          label: { show: false },
          labelLine: { show: false },
          data: [{ value: 1, itemStyle: { color: "transparent", borderColor: "#C7C9CC", borderWidth: 2 } }]
        } as any,
        // Main donut
        {
          name: "",
          type: "pie",
          z: 1,
          radius: [`${innerR}%`, `${outerR}%`],
          center: ["50%", `${this.centerYPercentSetting}%`],
          selectedMode: "single",
          selectedOffset: this.sliceSelectedOffset,
          startAngle: this.spinAngle % 360,
          animationType: "expansion",
          universalTransition: { enabled: true },
          label: {
            show: dlShow,
            position: "outside",
            color: dlColor,
            fontFamily: dlFontFamily,
            fontSize: dlFontSize,
            fontStyle: dlFontStyle,
            fontWeight: dlFontWeight,
            formatter: (p: any) => buildLabelText(p),
            opacity: dlOpacity,
            overflow: "break",
            lineHeight: labelLineHeightMain,
            width: Math.max(80, Math.floor(w * 0.25)) as any,
            rich: { }
          },
          labelLine: {
            show: true,
            length: labelLineLengthMain,
            length2: labelLineLength2Main,
            smooth: labelLineSmoothMain > 0 ? labelLineSmoothMain : false,
            lineStyle: {
              color: '#BFBFBF',
              width: 0.8
            }
          },
          avoidLabelOverlap: true,
          minShowLabelAngle: 8,
          // Goal: like ZoomCharts, keep every label at the same radial distance while allowing vertical shifts
          labelLayout: this.makePolarLabelLayout(seriesLayoutRadialMain, seriesLayoutHorizontalMain, labelSideMarginMain),
          emphasis: { scale: true },
          data: (basePieData as any).map((d: any) => ({ ...d, itemStyle: { ...(d.itemStyle||{}), borderColor: "#FFFFFF", borderWidth: 2 } }))
        } as any
      ]
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
      this.basePieData = basePieData.map(d => ({ ...d }));
      this.baseLegendNames = Array.isArray(legendNames) ? [...legendNames] : [];
    }

    // For pie, no custom hover band; ensure any previous overlays are cleared
    (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
    this.hoverGraphic = [];
    this.selectionGraphic = [];

    const renderDrillView = (categoryLabel: string, resetSelection: boolean, categoryKey?: any): boolean => {
      const pieData = this.buildDrillPieData(categoryLabel, categoryKey);
      if (!pieData || pieData.length === 0) {
        return false;
      }

      const displayLabel =
        categoryLabel ??
        (categoryKey !== undefined && categoryKey !== null ? String(categoryKey) : "");

      const objects: any = this.dataView?.metadata?.objects || {};
      const legendSettings: any = objects?.legend || {};
      const legendShow: boolean = legendSettings["show"] !== false;
      const pos: string = legendSettings["position"] || "top";
      const align: string = legendSettings["alignment"] || "center";
      const extra: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;
      const padding: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
      const detailShape = this.normalizeLegendShape(legendSettings["iconShape"]);
      const detailMarkerSize: number = typeof legendSettings["markerSize"] === "number" ? legendSettings["markerSize"] : 14;
      const detailFontSize: number = typeof legendSettings["fontSize"] === "number" ? legendSettings["fontSize"] : 12;
      const detailIconConfig = this.legendIconForShape(detailShape, detailMarkerSize);
      const drillHeaderSettings: any = objects?.drillHeader || {};
      const drillHeaderShow: boolean = drillHeaderSettings["show"] !== false;
      const isVerticalDetail = pos === "left" || pos === "right";
      let dTop: any = undefined;
      let dBottom: any = undefined;
      let dLeft: any = undefined;
      let dRight: any = undefined;
      if (pos === "top") dTop = `${8 + extra}%`;
      if (pos === "bottom") dBottom = `${10 + extra}%`;
      if (pos === "left") {
        dLeft = "2%";
        dTop = "5%";
      }
      if (pos === "right") {
        dRight = "2%";
        dTop = "5%";
      }
      if (pos === "top" || pos === "bottom") {
        if (align === "left") dLeft = "2%";
        else if (align === "right") dRight = "2%";
        else dLeft = "center";
      }
  const drillLegendNames = (pieData || []).map((d: any) => d.name);

  const labelLineLengthLocal = Math.max(4, this.labelLineLengthSetting);
  const labelLineLength2Local = Math.max(6, labelLineLengthLocal + 6);
  const labelLineSmoothLocal = Math.max(0, Math.min(1, this.labelCurveTensionSetting));
  const labelLineHeightLocal = Math.max(12, 12 + this.labelTextSpacingSetting);
  const labelSideMarginLocal = Math.max(12, 12 + this.labelTextSpacingSetting);
  const seriesLayoutRadialLocal = Math.max(6, labelLineLengthLocal * 0.5);
  const seriesLayoutHorizontalLocal = Math.max(10, labelLineLengthLocal + 4);

      // Build label visibility map for drill (aggregate labelVisibility over selected cat1 and each cat2)
      const labelVisibilityMapDrill = new Map<any, number>();
      if (labelVisibilityValues && Array.isArray(labelVisibilityValues)) {
        // Build index list for the selected Category[0]
        const idxs: number[] = [];
        for (let i = 0; i < rowCount; i++) {
          const v = (cat1All as any[])[i];
          const vStr = (v === null || v === undefined) ? "" : String(v);
          if (vStr === String(displayLabel)) idxs.push(i);
        }
        // For each cat2 present in pieData, sum visibility
        for (const d of pieData) {
          const c2Name = d.name;
          let sum = 0;
          for (const i of idxs) {
            const c2Val = (cat2All as any[])[i];
            if (String(c2Val) === String(c2Name)) {
              const visVal = (labelVisibilityValues as any[])[i];
              sum += (visVal === null || visVal === undefined) ? 0 : Number(visVal);
            }
          }
          labelVisibilityMapDrill.set(c2Name, sum);
        }
      }

      const labelFormatterDrill = (params: any) => {
        if (labelVisibilityMapDrill.size > 0) {
          const catName = params.name;
          const visValue = labelVisibilityMapDrill.get(catName) ?? 0;
          if (visValue <= 0) return "";
        }
        const v = params?.value;
        if (v === null || v === undefined || v === "") return dlShowBlankAs;
        if (dlTreatZeroAsBlank) {
          const numeric = typeof v === "number" ? v : Number(v);
          if (!Number.isNaN(numeric) && numeric === 0) return dlShowBlankAs ?? "";
        }
        return v as any;
      };

      // Drill labels should use general Data Labels settings (no per-subcategory overrides)

      this.chartInstance.setOption(
        {
          title: {
            text: drillHeaderShow ? `Details for ${displayLabel}` : "",
            left: "center",
            top: "2%",
            textStyle: { fontSize: 16 as any, fontWeight: "bold", color: "#333" },
          },
          legend: {
            show: legendShow,
            data: drillLegendNames,
            top: dTop,
            bottom: dBottom,
            left: dLeft,
            right: dRight,
            orient: isVerticalDetail ? "vertical" : "horizontal",
            padding,
            itemWidth: detailIconConfig.width,
            itemHeight: detailIconConfig.height,
            textStyle: { fontSize: detailFontSize },
            ...(detailIconConfig.icon ? { icon: detailIconConfig.icon } : {}),
          },
          series: [
            // Rim
            {
              name: "rim",
              type: "pie",
              silent: true,
              z: 0,
              radius: [`${outerR}%`, `${Math.min(outerR + 2, 98)}%`],
              center: ["50%", `${this.centerYPercentSetting}%`],
              label: { show: false },
              labelLine: { show: false },
              data: [{ value: 1, itemStyle: { color: "transparent", borderColor: "#C7C9CC", borderWidth: 2 } }]
            } as any,
            // Main donut
            {
              name: displayLabel,
              type: "pie",
              z: 1,
              radius: [`${innerR}%`, `${outerR}%`],
              center: ["50%", `${this.centerYPercentSetting}%`],
              selectedMode: "single",
              selectedOffset: this.sliceSelectedOffset,
              // circular motion: spin the start angle +360 each drill
              startAngle: (this.spinAngle = (this.spinAngle + 360)) % 360,
              universalTransition: { enabled: true, divideShape: "clone" },
              label: {
                show: dlShow,
                position: "outside",
                color: dlColor,
                fontFamily: dlFontFamily,
                fontSize: dlFontSize,
                fontStyle: dlFontStyle,
                fontWeight: dlFontWeight,
                formatter: (p: any) => {
                  const txt = labelFormatterDrill(p);
                  if (txt === "") return "";
                  const name = p.name ?? "";
                  const raw = p.value;
                  const n = typeof raw === "number" ? raw : Number(raw);
                  const hasNumeric = raw !== null && raw !== undefined && raw !== "" && Number.isFinite(n);
                  // Use drill-level Data Labels settings (fallback to global if unspecified)
                  const unit = dlDisplayUnitDrill;
                  const dec = dlValueDecimalsDrill;
                  const vtype = dlValueTypeDrill;
                  const valueText = hasNumeric ? formatNumberWithUnit(n, unit, dec, vtype) : "";
                  const pct = (p.percent != null) ? `(${p.percent}%)` : "";
                  return hasNumeric ? `${name} ${valueText}\n${pct}` : name;
                },
                opacity: dlOpacity,
                overflow: "break",
                lineHeight: labelLineHeightLocal,
                width: Math.max(80, Math.floor(w * 0.25)) as any
              },
              labelLine: { show: true, length: labelLineLengthLocal, length2: labelLineLength2Local, smooth: labelLineSmoothLocal, lineStyle: { width: 0.8, color: '#BFBFBF', type: 'solid' } },
              avoidLabelOverlap: true,
              minShowLabelAngle: 8,
              labelLayout: this.makePolarLabelLayout(seriesLayoutRadialLocal, seriesLayoutHorizontalLocal, labelSideMarginLocal + 4),
              emphasis: { scale: true },
              data: (pieData as any).map((d: any) => ({
                ...d,
                itemStyle: { color: resolveCategoryColor(d.name, true), borderColor: "#FFFFFF", borderWidth: 2 }
              }))
            } as any
          ],
          animationDurationUpdate: 900,
          animationEasingUpdate: "circularInOut",
        } as any,
        false
      );

      this.isDrilled = true;
      this.drillCategory = displayLabel;
      this.drillCategoryKey = categoryKey ?? categoryLabel ?? displayLabel;
      this.currentCategories = Array.isArray(drillLegendNames) ? [...drillLegendNames] : [];

      // Clear graphics overlays; show buttons
      (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
      this.hoverGraphic = [];
      this.selectionGraphic = [];
      this.selectedIndex = null;
      this.updateDrillGraphics();
      return true;
    };

    // Wire click handlers for animated drilldown using real second-level categories
    this.chartInstance.off("click");
    this.chartInstance.off("dblclick");
    this.chartInstance.on("click", (params: any) => {
      if (params && params.componentType === "series" && !this.isDrilled) {
        const clickedCategoryLabel: string = params.name;
        const clickedIndex: number =
          typeof params.dataIndex === "number"
            ? params.dataIndex
            : (this.currentCategories || []).indexOf(clickedCategoryLabel);
        const baseCats =
          (Array.isArray(this.baseCategories) && this.baseCategories.length > 0)
            ? this.baseCategories
            : this.currentCategories;
        const clickedKey =
          clickedIndex >= 0 && baseCats && clickedIndex < baseCats.length
            ? baseCats[clickedIndex]
            : clickedCategoryLabel;
        renderDrillView(clickedCategoryLabel, true, clickedKey);
        return;
      } else if (this.isDrilled && params && params.componentType === "series") {
        // In drill level, toggle ECharts 'selected' state for the clicked slice (visual feedback only)
        const idx: number = typeof params.dataIndex === "number" ? params.dataIndex : -1;
        const series = (this.chartInstance as any).getOption().series?.[0];
        if (series && idx >= 0) {
          const dataArr = series.data || [];
          dataArr.forEach((d: any, i: number) => d.selected = (i === idx) ? !d.selected : false);
          (this.chartInstance as any).setOption({ series: [{ ...series, data: dataArr }] });
        }
      }
    });

    if (this.isDrilled && this.drillCategory) {
      if (!renderDrillView(this.drillCategory, false, this.drillCategoryKey)) {
        // If no drill data is available anymore, restore base view
        this.restoreBaseView();
      }
    } else {
      this.hoverGraphic = [];
      if (this.selectedIndex !== null) {
        this.selectedIndex = null;
      }
      this.selectionGraphic = [];
      (this.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
      this.updateDrillGraphics();
    }

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
      // Always enumerate Category[0] (base level)
      const categorical = this.dataView?.categorical;
      const hostAny: any = this.host as any;
      const cat0 = categorical?.categories?.[0];
      if (!categorical || !cat0) return enumeration;
      const values = cat0.values || [];
      const firstIndexByName = new Map<string, number>();
      for (let i = 0; i < values.length; i++) {
        const name = (values[i] === null || values[i] === undefined || String(values[i]) === "") ? "(Blank)" : String(values[i]);
        if (!firstIndexByName.has(name)) firstIndexByName.set(name, i);
      }
      for (const [name, idx] of firstIndexByName) {
        const selId = hostAny?.createSelectionIdBuilder?.()?.withCategory(cat0 as any, idx)?.createSelectionId?.();
        const selector = selId?.getSelector ? selId.getSelector() : selId;
        if (selector) {
          enumeration.push({
            objectName: "dataPoint",
            displayName: name,
            properties: { fill: { solid: { color: this.seriesColorsL1?.[name] ?? "#3366CC" } } },
            selector: selector as any
          });
        }
      }
    }

    if (options.objectName === "dataPointDrill") {
      // Always enumerate Category[1] (drill level)
      const categorical = this.dataView?.categorical;
      const hostAny: any = this.host as any;
      const cat1 = categorical?.categories?.[1];
      if (!categorical || !cat1) return enumeration;
      const values = cat1.values || [];
      const firstIndexByName = new Map<string, number>();
      for (let i = 0; i < values.length; i++) {
        const name = (values[i] === null || values[i] === undefined || String(values[i]) === "") ? "(Blank)" : String(values[i]);
        if (!firstIndexByName.has(name)) firstIndexByName.set(name, i);
      }
      // Show only visible drill categories if we have them; else show all unique level-2
      const namesToShow = (this.currentCategories && this.currentCategories.length > 0)
        ? this.currentCategories.map((n: any) => String(n))
        : Array.from(firstIndexByName.keys());
      for (const name of namesToShow) {
        const idx = firstIndexByName.get(String(name));
        if (idx === undefined) continue;
        const selId = hostAny?.createSelectionIdBuilder?.()?.withCategory(cat1 as any, idx)?.createSelectionId?.();
        const selector = selId?.getSelector ? selId.getSelector() : selId;
        if (selector) {
          enumeration.push({
            objectName: "dataPointDrill",
            displayName: name,
            properties: { fill: { solid: { color: this.seriesColorsL2?.[name] ?? "#3366CC" } } },
            selector: selector as any
          });
        }
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
      const legendObj: any = objects?.legend || {};
      const position = legendObj?.position || "top";
      const alignment = legendObj?.alignment || "center";
      const iconShape = this.normalizeLegendShape(legendObj?.iconShape);
      const markerSize = typeof legendObj?.markerSize === "number" ? legendObj.markerSize : 14;
      const fontSize = typeof legendObj?.fontSize === "number" ? legendObj.fontSize : 12;
      const extraMargin = typeof legendObj?.extraMargin === "number" ? legendObj.extraMargin : 0;
      const padding = typeof legendObj?.padding === "number" ? legendObj.padding : 0;
      enumeration.push({
        objectName: "legend",
        displayName: "Legend",
        properties: {
          show: legendObj?.show !== false,
          position,
          alignment,
          iconShape,
          markerSize,
          fontSize,
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
          transparency: dl?.transparency || 0,
          showBlankAs: typeof dl?.showBlankAs === "string" ? dl.showBlankAs : "",
          treatZeroAsBlank: dl?.treatZeroAsBlank === true,
          displayUnit: dl?.displayUnit || "auto",
          valueDecimals: typeof dl?.valueDecimals === "number" ? dl.valueDecimals : 2
        },
        selector: undefined as any
      });
    }
    if (options.objectName === "spacing") {
      const sp: any = (this.dataView?.metadata?.objects as any)?.spacing || {};
      enumeration.push({
        objectName: "spacing",
        displayName: "Spacing",
        properties: {
          innerRadiusPercent: typeof sp?.innerRadiusPercent === 'number' ? sp.innerRadiusPercent : 24,
          ringWidthPercent: typeof sp?.ringWidthPercent === 'number' ? sp.ringWidthPercent : 58,
          centerYPercent: typeof sp?.centerYPercent === 'number' ? sp.centerYPercent : this.centerYPercentSetting
        },
        selector: undefined as any
      });
    }
    if (options.objectName === "drillHeader") {
      const dh: any = (this.dataView?.metadata?.objects as any)?.drillHeader || {};
      enumeration.push({
        objectName: "drillHeader",
        displayName: "Drill Header",
        properties: {
          show: dh?.show !== false
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
    if (options.objectName === "labelTuning") {
      const obj: any = (this.dataView?.metadata?.objects as any)?.labelTuning || {};
      enumeration.push({
        objectName: "labelTuning",
        displayName: "Label & Line Tuning",
        properties: {
          lineLength: typeof obj?.lineLength === "number" ? obj.lineLength : this.labelLineLengthSetting,
          curveTension: typeof obj?.curveTension === "number" ? obj.curveTension : this.labelCurveTensionSetting,
          textSpacing: typeof obj?.textSpacing === "number" ? obj.textSpacing : this.labelTextSpacingSetting,
          columnOffset: typeof obj?.columnOffset === "number" ? obj.columnOffset : this.labelColumnOffsetSetting,
          sidePadding: typeof obj?.sidePadding === "number" ? obj.sidePadding : this.labelSidePaddingSetting
        },
        selector: undefined as any
      });
    }
    return enumeration;
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    // Base model from formatting settings
    const model = this.formattingSettingsService.buildFormattingModel(this.formattingSettings);

    // No per-category Data Labels card for Category[0]; keep only global controls

    // Drill labels are general; no dynamic per-subcategory card needed

    // Also keep dynamic Data colors (below)
    
    // ColorHelper-like dynamic card construction moved below
    
    // Return model (colors card will be injected later in this method)
    // We'll append the data colors card as currently implemented further below and then return at the end.
    
    // The rest of this function already builds and unshifts a Data colors card; keep that behavior.
    // We'll let the existing code run and finally return model.

    // Note: existing code below ends with 'return model;'.
    
    // Return the built model (including any dynamic per-category cards added above)
    return model;
    
  }
    // Agregar dinámicamente las instancias de dataPoint (colores por serie)
  public destroy() {
    this.chartInstance.dispose();
  }

}

