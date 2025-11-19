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

interface RenderConfig {
  radius: number;
  lineLengthConfig: LineLengthConfig;
  width: number;
  height: number;
  wrap: TextWrapMode;
}

// 🎨 Clase DonutRenderer (copiada exactamente del ejemplo)
class DonutRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  constructor(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
    this.svg = svg;
  }

  public render(viewModel: DonutDataPoint[], config: RenderConfig): void {
    const { radius, lineLengthConfig, width, height, wrap } = config;
    
    // Limpiar SVG
    this.svg.selectAll("*").remove();
    
    const g = this.svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Configurar generadores D3
    const pie = d3.pie<any>().value((d: DonutDataPoint) => d.value);
    const arc = d3.arc<d3.PieArcDatum<DonutDataPoint>>()
      .innerRadius(radius * DONUT_CONFIG.INNER_RADIUS_RATIO)
      .outerRadius(radius * DONUT_CONFIG.OUTER_RADIUS_RATIO);
    const color = d3.scaleOrdinal(d3.schemeSet2);

    // Renderizar componentes
    this.renderDonut(g, viewModel, pie, arc, color);
    this.renderLines(g, viewModel, pie, radius, lineLengthConfig);
    this.renderLabels(g, viewModel, pie, radius, lineLengthConfig, wrap);
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

  private getGeometryHelpers(d: d3.PieArcDatum<any>, radius: number): GeometryHelpers {
    const mid = (d.startAngle + d.endAngle) / 2;
    const direction = mid < Math.PI ? 1 : -1;
    return {
      mid,
      direction,
      outerRadius: radius * DONUT_CONFIG.OUTER_RADIUS_RATIO,
      midRadius: radius * DONUT_CONFIG.LINE_START_RATIO
    };
  }

  private calculateLinePoints(helpers: GeometryHelpers, lineLength: number): number[][] {
    const { mid, direction, outerRadius, midRadius } = helpers;
    
    const startPoint = [
      Math.cos(mid - Math.PI / 2) * outerRadius,
      Math.sin(mid - Math.PI / 2) * outerRadius
    ];
    
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
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
                     color: d3.ScaleOrdinal<string, string, never>): void {
    g.selectAll("path")
      .data(pie(viewModel))
      .enter()
      .append("path")
      .attr("d", arc)
      .attr("fill", (d: any) => color(d.data.category))
      .style("stroke", "#fff")
      .style("stroke-width", "2px");
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
    
    if (!dataView || !dataView.categorical) {
      this.renderer.renderNoData(options.viewport.width, options.viewport.height);
      return;
    }

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

    // Configurar renderizado
    const radius = Math.min(options.viewport.width, options.viewport.height) / 2 - DONUT_CONFIG.MARGIN;
    const lineLengthConfig = this.getLineLengthConfig(dataView, viewModel);
    
    const config: RenderConfig = {
      radius,
      lineLengthConfig,
      width: options.viewport.width,
      height: options.viewport.height,
      wrap: DONUT_CONFIG.DEFAULT_WRAP
    };

    // Renderizar
    this.renderer.render(viewModel, config);
  }

  private createViewModel(dataView: powerbi.DataView): DonutDataPoint[] {
    const categorical = dataView.categorical;
    if (!categorical || !categorical.categories || !categorical.values) {
      return [];
    }

    const categories = categorical.categories[0].values;
    const values = categorical.values[0].values;
    
    const dataPoints: DonutDataPoint[] = [];
    const total = values.reduce((sum: number, val: any) => {
      const num = typeof val === "number" ? val : Number(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

    for (let i = 0; i < categories.length; i++) {
      const category = categories[i] == null ? "(Blank)" : String(categories[i]);
      const rawValue = values[i];
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      
      if (!isNaN(value) && isFinite(value)) {
        dataPoints.push({
          category,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0
        });
      }
    }

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
    if (dataView?.metadata?.objects?.labelTuning?.lineLengthMode) {
      return dataView.metadata.objects.labelTuning.lineLengthMode as LineLengthMode;
    }
    return DONUT_CONFIG.DEFAULT_LINE_MODE;
  }

  private getGlobalLineLength(dataView: powerbi.DataView): number {
    if (dataView?.metadata?.objects?.labelTuning?.lineLength) {
      const value = dataView.metadata.objects.labelTuning.lineLength as number;
      return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getCategoryLineLength(dataView: powerbi.DataView, categoryIndex: number): number {
    const propertyName = `lineLength_${categoryIndex}`;
    if (dataView?.metadata?.objects?.labelTuning?.[propertyName]) {
      const value = dataView.metadata.objects.labelTuning[propertyName] as number;
      return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
  }
}