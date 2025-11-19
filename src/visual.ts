/*
 * Power BI Visual - Pure D3 Implementation
 * Based on example/visual.ts
 */
"use strict";

import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";
import "./../style/visual.less";

// 🎯 Constantes de configuración (idénticas al ejemplo)
const DONUT_CONFIG = {
  INNER_RADIUS_RATIO: 0.4,
  OUTER_RADIUS_RATIO: 0.8,
  LINE_START_RATIO: 0.9,
  MARGIN: 50,
  TEXT_SPACING: 10,
  DEFAULT_LINE_LENGTH: 20,
  MIN_LINE_LENGTH: 0,
  MAX_LINE_LENGTH: 100,
  DEFAULT_WRAP: "wrap" as TextWrapMode,
  DEFAULT_ALIGN: "auto",
  DEFAULT_LINE_MODE: "all" as LineLengthMode
} as const;

// 🎨 Tipos
type TextAlign = "auto" | "left" | "center" | "right";
type TextWrapMode = "wrap" | "single";
type LineLengthMode = "all" | "individual";

interface LineLengthConfig {
  mode: LineLengthMode;
  globalLength: number;
  categoryLengths: Record<string, number>;
}

interface DonutDataPoint {
  category: string;
  value: number;
  percentage: number;
}

interface GeometryHelpers {
  mid: number;
  direction: number;
  outerRadius: number;
  midRadius: number;
}

interface SpacingConfig {
  innerRadiusPercent: number;
  ringWidthPercent: number;
  centerYPercent: number;
}

interface RenderConfig {
  radius: number;
  lineLengthConfig: LineLengthConfig;
  width: number;
  height: number;
  wrap: TextWrapMode;
  spacing: SpacingConfig;
}

// 🎨 Clase DonutRenderer (copiada exactamente del ejemplo)
class DonutRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  constructor(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
    this.svg = svg;
  }

  public render(viewModel: DonutDataPoint[], config: RenderConfig, onSliceClick?: (category: string) => void, onBackClick?: () => void, isDrilled?: boolean, drillCategory?: string): void {
    const { radius, lineLengthConfig, width, height, wrap, spacing } = config;
    
    // Limpiar SVG
    this.svg.selectAll("*").remove();
    
    // Render navigation buttons if in drill mode
    if (isDrilled) {
      this.renderNavigationButtons(width, height, onBackClick, drillCategory);
    }
    
    // Calcular posición Y usando centerYPercent
    const centerY = (height * spacing.centerYPercent) / 100;
    
    const g = this.svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${centerY})`);

    // Configurar generadores D3 con spacing personalizado (como en la versión ECharts)
    const pie = d3.pie<any>().value((d: DonutDataPoint) => d.value);
    const innerRadius = radius * (spacing.innerRadiusPercent / 100);
    const outerRadius = radius * ((spacing.innerRadiusPercent + spacing.ringWidthPercent) / 100);
    
    const arc = d3.arc<d3.PieArcDatum<DonutDataPoint>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);
    const color = d3.scaleOrdinal(d3.schemeSet2);

    // Renderizar componentes
    this.renderDonut(g, viewModel, pie, arc, color, onSliceClick);
    this.renderLines(g, viewModel, pie, outerRadius, lineLengthConfig);
    this.renderLabels(g, viewModel, pie, outerRadius, lineLengthConfig, wrap);
  }

  private renderNavigationButtons(width: number, height: number, onBackClick?: () => void, drillCategory?: string): void {
    // Back button
    const backButton = this.svg.append("g")
      .attr("class", "nav-button")
      .attr("transform", "translate(20, 20)")
      .style("cursor", "pointer")
      .on("click", onBackClick);
    
    backButton.append("text")
      .text("↩ Back")
      .style("font-family", "Segoe UI")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .style("fill", "#555");
    
    // Title showing drill category
    if (drillCategory) {
      this.svg.append("text")
        .text(`Details for ${drillCategory}`)
        .attr("x", width / 2)
        .attr("y", 30)
        .style("text-anchor", "middle")
        .style("font-family", "Segoe UI")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#333");
    }
  }

  public renderNoData(width: number, height: number): void {
    this.svg.selectAll("*").remove();
    this.svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", "#666")
      .text("No data available");
  }

  private getGeometryHelpers(d: d3.PieArcDatum<any>, outerRadius: number): GeometryHelpers {
    const mid = (d.startAngle + d.endAngle) / 2;
    const direction = mid < Math.PI ? 1 : -1;
    return {
      mid,
      direction,
      outerRadius: outerRadius,
      midRadius: outerRadius * 1.1  // Las líneas salen desde justo fuera del borde exterior
    };
  }

  private calculateLinePoints(helpers: GeometryHelpers, lineLength: number): number[][] {
    const { mid, direction, outerRadius, midRadius } = helpers;
    
    // Punto de inicio: desde el borde exterior del donut
    const startPoint = [
      Math.cos(mid - Math.PI / 2) * outerRadius,
      Math.sin(mid - Math.PI / 2) * outerRadius
    ];
    
    // Punto medio: un poco más afuera para hacer la línea visible
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
    // Punto final: se extiende horizontalmente según lineLength
    const finalPoint = [
      midPoint[0] + (lineLength * direction),
      midPoint[1]
    ];

    return [startPoint, midPoint, finalPoint];
  }

  private calculateTextPosition(helpers: GeometryHelpers, lineLength: number): [number, number] {
    const { mid, direction, midRadius } = helpers;
    
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
    const textX = midPoint[0] + (lineLength * direction) + (DONUT_CONFIG.TEXT_SPACING * direction);
    const textY = midPoint[1];
    
    return [textX, textY];
  }

  private renderDonut(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     viewModel: DonutDataPoint[], 
                     pie: d3.Pie<any, DonutDataPoint>, 
                     arc: d3.Arc<any, d3.PieArcDatum<DonutDataPoint>>,
                     color: d3.ScaleOrdinal<string, string, never>,
                     onSliceClick?: (category: string) => void): void {
    g.selectAll("path")
      .data(pie(viewModel))
      .enter()
      .append("path")
      .attr("d", arc)
      .attr("fill", (d: any) => color(d.data.category))
      .style("stroke", "#fff")
      .style("stroke-width", "2px")
      .style("cursor", onSliceClick ? "pointer" : "default")
      .on("click", onSliceClick ? function(d: any) {
        // En D3 v5, 'd' es el primer parámetro
        onSliceClick(d.data.category);
      } : null);
  }

  private renderLines(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     viewModel: DonutDataPoint[], 
                     pie: d3.Pie<any, DonutDataPoint>, 
                     radius: number, 
                     lineLengthConfig: LineLengthConfig): void {
    g.selectAll("polyline")
      .data(pie(viewModel))
      .enter()
      .append("polyline")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("fill", "none")
      .attr("points", (d: d3.PieArcDatum<any>) => {
        const helpers = this.getGeometryHelpers(d, radius);
        const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
        const points = this.calculateLinePoints(helpers, lineLength);
        return points.map((p) => p.join(",")).join(" ");
      });
  }

  private renderLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                      viewModel: DonutDataPoint[], 
                      pie: d3.Pie<any, DonutDataPoint>, 
                      radius: number, 
                      lineLengthConfig: LineLengthConfig,
                      wrap: TextWrapMode): void {
    const pieData = pie(viewModel);
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength);
      
      const fullText = `${d.data.category}: ${d.data.value} (${d.data.percentage.toFixed(1)}%)`;
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      
      g.append("text")
        .text(fullText)
        .attr("transform", `translate(${textX}, ${textY})`)
        .style("text-anchor", textAnchor)
        .style("font-size", "12px")
        .style("fill", "#444");
    });
  }

  private getLineLengthForCategory(category: string, config: LineLengthConfig): number {
    if (config.mode === "individual" && config.categoryLengths[category] !== undefined) {
      return config.categoryLengths[category];
    }
    return config.globalLength;
  }

  private getTextAnchor(d: d3.PieArcDatum<any>, radius: number, align: TextAlign): string {
    if (align !== "auto") return align;
    const mid = (d.startAngle + d.endAngle) / 2;
    return mid < Math.PI ? "start" : "end";
  }
}

// 🎨 Clase Visual Principal
export class Visual implements powerbi.extensibility.visual.IVisual {
  private host: powerbi.extensibility.visual.IVisualHost;
  private container: HTMLElement;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private renderer: DonutRenderer;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  
  // Drill down state (identical to ECharts version)
  private isDrilled: boolean = false;
  private drillCategory: string | null = null;
  private drillCategoryKey: any = null;
  private dataView: powerbi.DataView | null = null;
  private baseCategories: any[] = [];
  private currentCategories: any[] = [];

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.container = options.element;
    
    // Crear SVG
    this.svg = d3.select(this.container)
      .append("svg")
      .style("width", "100%")
      .style("height", "100%");
    
    this.renderer = new DonutRenderer(this.svg);
    this.formattingSettingsService = new FormattingSettingsService();
    this.formattingSettings = new VisualFormattingSettingsModel();
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
    const dataView = options.dataViews && options.dataViews[0];
    this.dataView = dataView;
    
    if (!dataView || !dataView.categorical) {
      this.renderer.renderNoData(options.viewport.width, options.viewport.height);
      return;
    }

    // Actualizar configuraciones de formato
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

    // Actualizar tamaño del SVG
    this.svg
      .attr("width", options.viewport.width)
      .attr("height", options.viewport.height);

    // Procesar datos
    const viewModel = this.createViewModel(dataView);
    if (!viewModel || viewModel.length === 0) {
      this.renderer.renderNoData(options.viewport.width, options.viewport.height);
      return;
    }

    // Configurar renderizado con spacing settings
    const spacingConfig = this.getSpacingConfig(dataView);
    const radius = Math.min(options.viewport.width, options.viewport.height) / 2 - DONUT_CONFIG.MARGIN;
    const lineLengthConfig = this.getLineLengthConfig(dataView, viewModel);
    
    const config: RenderConfig = {
      radius,
      lineLengthConfig,
      width: options.viewport.width,
      height: options.viewport.height,
      wrap: DONUT_CONFIG.DEFAULT_WRAP,
      spacing: spacingConfig
    };

    // Save base state if not drilled (like ECharts version)
    if (!this.isDrilled) {
      const categories = dataView.categorical.categories[0].values;
      this.baseCategories = [];
      const seen = new Set();
      for (const cat of categories) {
        if (!seen.has(cat)) {
          seen.add(cat);
          this.baseCategories.push(cat);
        }
      }
      this.currentCategories = [...this.baseCategories];
    }
    
    // Always enable click when not drilled (like ECharts version)
    const onSliceClick = !this.isDrilled ? (category: string) => {
      // Find the category key (exact match logic from ECharts)
      const clickedIndex = this.currentCategories.indexOf(category);
      const clickedKey = clickedIndex >= 0 && this.baseCategories && clickedIndex < this.baseCategories.length
        ? this.baseCategories[clickedIndex]
        : category;
      
      // Execute drill down (identical to renderDrillView logic)
      const drillData = this.buildDrillData(dataView, category);
      if (drillData && drillData.length > 0) {
        this.isDrilled = true;
        this.drillCategory = category;
        this.drillCategoryKey = clickedKey;
        this.currentCategories = drillData.map(d => d.category);
        this.update(options); // Re-render with drill data
      }
    } : undefined;
    
    const onBackClick = this.isDrilled ? () => {
      this.isDrilled = false;
      this.drillCategory = null;
      this.drillCategoryKey = null;
      this.currentCategories = [...this.baseCategories];
      this.update(options); // Re-render with main data
    } : undefined;

    // Renderizar
    this.renderer.render(viewModel, config, onSliceClick, onBackClick, this.isDrilled, this.drillCategory);
  }

  private createViewModel(dataView: powerbi.DataView): DonutDataPoint[] {
    const categorical = dataView.categorical;
    if (!categorical || !categorical.categories || !categorical.values) {
      return [];
    }

    // Check if we have two category levels for drill down
    const hasSecondCategory = categorical.categories && categorical.categories.length > 1;
    
    if (this.isDrilled && hasSecondCategory && this.drillCategory) {
      // Build drill down data (second level)
      return this.buildDrillData(dataView, this.drillCategory);
    } else {
      // Build main level data (first category)
      return this.buildMainData(dataView);
    }
  }

  private buildMainData(dataView: powerbi.DataView): DonutDataPoint[] {
    const categorical = dataView.categorical;
    const cat1Values = categorical.categories[0].values;
    const allValues = categorical.values[0].values;
    
    // Aggregate by first category (same logic as ECharts version)
    const categoryTotals = new Map<any, number>();
    
    for (let i = 0; i < cat1Values.length; i++) {
      const category = cat1Values[i];
      const rawValue = allValues[i];
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      
      if (!isNaN(value) && isFinite(value)) {
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + value);
      }
    }
    
    // Get unique categories in order of appearance
    const uniqueCategories: any[] = [];
    const seen = new Set();
    for (const cat of cat1Values) {
      if (!seen.has(cat)) {
        seen.add(cat);
        uniqueCategories.push(cat);
      }
    }
    
    // Calculate total for percentages
    let total = 0;
    categoryTotals.forEach(value => total += value);
    
    // Build data points
    const dataPoints: DonutDataPoint[] = [];
    for (const category of uniqueCategories) {
      const categoryName = category == null ? "(Blank)" : String(category);
      const value = categoryTotals.get(category) || 0;
      
      if (value > 0) {
        dataPoints.push({
          category: categoryName,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0
        });
      }
    }

    return dataPoints;
  }

  private buildDrillData(dataView: powerbi.DataView, drillCategory: string): DonutDataPoint[] {
    // Replicate exact logic from buildDrillPieData in ECharts version
    const categorical = dataView.categorical;
    const cat1 = categorical.categories[0].values;
    
    // Check if second category exists
    if (!categorical.categories || categorical.categories.length < 2) {
      return [];
    }
    
    const cat2 = categorical.categories[1].values;
    const valuesCols = categorical.values || [];
    const rowCount = (cat1 as any[]).length;

    // Exact match logic from ECharts version
    const matchesCategory = (value: any) => {
      if (this.drillCategoryKey !== undefined && this.drillCategoryKey !== null) {
        const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function")
          ? value.valueOf() : value;
        const keyPrimitive = (this.drillCategoryKey !== null && this.drillCategoryKey !== undefined && typeof this.drillCategoryKey.valueOf === "function")
          ? this.drillCategoryKey.valueOf() : this.drillCategoryKey;
        if (valuePrimitive === keyPrimitive || String(valuePrimitive) === String(keyPrimitive)) return true;
      }
      if (value === drillCategory) return true;
      if (value !== null && value !== undefined && drillCategory !== null && drillCategory !== undefined) {
        return String(value) === String(drillCategory);
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

    // Helper to add from a column source (exact ECharts logic)
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

    // Convert to DonutDataPoint format
    const dataPoints: DonutDataPoint[] = [];
    let total = 0;
    totals.forEach(value => total += value);
    
    cat2Order.forEach((name) => {
      const value = totals.get(name) || 0;
      if (value > 0) {
        dataPoints.push({
          category: String(name),
          value,
          percentage: total > 0 ? (value / total) * 100 : 0
        });
      }
    });
    
    return dataPoints;
  }

  private getLineLengthConfig(dataView: powerbi.DataView, viewModel: DonutDataPoint[]): LineLengthConfig {
    const mode = this.getLineLengthMode(dataView);
    const globalLength = this.getGlobalLineLength(dataView);
    const categoryLengths: Record<string, number> = {};

    if (mode === "individual") {
      viewModel.forEach((d, index) => {
        categoryLengths[d.category] = this.getCategoryLineLength(dataView, index);
      });
    }

    return {
      mode,
      globalLength,
      categoryLengths
    };
  }

  private getLineLengthMode(dataView: powerbi.DataView): LineLengthMode {
    const objects = dataView?.metadata?.objects;
    if (objects?.labelTuning?.lineLengthMode) {
      const mode = objects.labelTuning.lineLengthMode as string;
      return (mode === "individual" ? "individual" : "all") as LineLengthMode;
    }
    return DONUT_CONFIG.DEFAULT_LINE_MODE;
  }

  private getGlobalLineLength(dataView: powerbi.DataView): number {
    const objects = dataView?.metadata?.objects;
    if (objects?.labelTuning?.lineLength) {
      const value = objects.labelTuning.lineLength as number;
      if (typeof value === 'number' && !isNaN(value)) {
        return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
      }
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getCategoryLineLength(dataView: powerbi.DataView, categoryIndex: number): number {
    const propertyName = `lineLength_${categoryIndex}`;
    const objects = dataView?.metadata?.objects;
    if (objects?.labelTuning?.[propertyName]) {
      const value = objects.labelTuning[propertyName] as number;
      if (typeof value === 'number' && !isNaN(value)) {
        return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
      }
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getSpacingConfig(dataView: powerbi.DataView): SpacingConfig {
    const objects = dataView?.metadata?.objects;
    const spacing = objects?.spacing;
    
    return {
      innerRadiusPercent: this.clampValue(spacing?.innerRadiusPercent, 24, 5, 90),
      ringWidthPercent: this.clampValue(spacing?.ringWidthPercent, 58, 4, 90),
      centerYPercent: this.clampValue(spacing?.centerYPercent, 58, 0, 100)
    };
  }

  private clampValue(value: any, defaultValue: number, min: number, max: number): number {
    if (typeof value === 'number' && !isNaN(value)) {
      return Math.max(min, Math.min(max, value));
    }
    return defaultValue;
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    // Actualizar visibilidad de slices según el modo
    const isIndividualMode = this.formattingSettings.labelTuningCard.lineLengthMode.value.value === "individual";
    
    // Controlar visibilidad de configuraciones individuales
    this.formattingSettings.labelTuningCard.lineLength.visible = !isIndividualMode;
    
    // Configurar slices individuales con nombres de categorías si están disponibles
    const individualSlices = [
      this.formattingSettings.labelTuningCard.lineLength_0,
      this.formattingSettings.labelTuningCard.lineLength_1,
      this.formattingSettings.labelTuningCard.lineLength_2,
      this.formattingSettings.labelTuningCard.lineLength_3,
      this.formattingSettings.labelTuningCard.lineLength_4,
      this.formattingSettings.labelTuningCard.lineLength_5,
      this.formattingSettings.labelTuningCard.lineLength_6,
      this.formattingSettings.labelTuningCard.lineLength_7,
      this.formattingSettings.labelTuningCard.lineLength_8,
      this.formattingSettings.labelTuningCard.lineLength_9
    ];
    
    individualSlices.forEach((slice, index) => {
      slice.visible = isIndividualMode;
      // TODO: Actualizar displayName con nombre de categoría real cuando esté disponible
      slice.displayName = `Category ${index} Line Length`;
    });
    
    return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
  }
}