"use strict";

import "./../style/visual.less";
import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";

// 🎯 Constantes de configuración
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

// 🎨 Tipos para Label placement
type TextAlign = "auto" | "left" | "center" | "right";
type TextWrapMode = "wrap" | "single";
type LineLengthMode = "all" | "individual";

// 📏 Interface para configuración de Line Length
interface LineLengthConfig {
  mode: LineLengthMode;
  globalLength: number;
  categoryLengths: Record<string, number>;
}

// 📊 Interfaces
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

// 🎨 Clase DonutRenderer - Maneja todo el renderizado
class DonutRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  constructor(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
    this.svg = svg;
  }

  public render(viewModel: DonutDataPoint[], config: RenderConfig): void {
    const { radius, lineLengthConfig, width, height, wrap } = config;
    
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
    if (wrap === "wrap") {
      this.renderWrappedLabels(g, pie(viewModel), radius, lineLengthConfig);
    } else {
      this.renderSingleLabels(g, pie(viewModel), radius, lineLengthConfig);
    }
  }

  private renderSingleLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                            pieData: d3.PieArcDatum<DonutDataPoint>[],
                            radius: number,
                            lineLengthConfig: LineLengthConfig): void {
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength);
      
      const fullText = `${d.data.category}: ${d.data.value} (${d.data.percentage.toFixed(1)}%)`;
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      
      // Texto normal en una sola línea (sin auto-wrapping por ahora)
      g.append("text")
        .text(fullText)
        .attr("transform", `translate(${textX}, ${textY})`)
        .style("text-anchor", textAnchor)
        .style("font-size", "12px")
        .style("fill", "#444");
    });
  }

  private renderWrappedLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                             pieData: d3.PieArcDatum<DonutDataPoint>[],
                             radius: number,
                             lineLengthConfig: LineLengthConfig): void {
    const containerWidth = parseInt(this.svg.attr("width")) || 400;
    const centerX = containerWidth / 2;
    const margin = -5;
    
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength);
      
      const textGroup = g.append("g")
        .attr("transform", `translate(${textX}, ${textY})`);

      // Dividir texto en líneas
      const category = d.data.category;
      const value = d.data.value.toString();
      const percentage = d.data.percentage.toFixed(1) + '%';
      
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      const absoluteTextX = centerX + textX;
      
      // Línea 1: Categoría (con auto-wrapping solo si no cabe)
      const categoryWidth = this.estimateTextWidth(category, 12);
      
      let categoryWillOverflow = false;
      if (helpers.direction < 0) {
        categoryWillOverflow = (absoluteTextX - categoryWidth - margin) < 0;
      } else {
        categoryWillOverflow = (absoluteTextX + categoryWidth + margin) > containerWidth;
      }
      
      let categoryLines: string[];
      if (categoryWillOverflow && category.includes(' ')) {
        // Solo dividir si hay overflow Y tiene espacios
        const maxCategoryWidth = lineLength * 2;
        categoryLines = this.splitCategoryText(category, maxCategoryWidth, 12);
      } else {
        // Mantener junto si cabe o si es una sola palabra
        categoryLines = [category];
      }
      
      categoryLines.forEach((line, index) => {
        textGroup.append("text")
          .text(line)
          .style("text-anchor", textAnchor)
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .style("fill", "#444")
          .attr("dy", `${-0.3 + (index * 1.2)}em`);
      });
      
      // Línea siguiente: Verificar overflow para AMBOS LADOS
      const secondLineText = `${value} (${percentage})`;
      const categoryLineCount = categoryLines.length;
      const baseOffset = categoryLineCount > 1 ? (categoryLineCount - 1) * 1.2 + 0.7 : 1;
      
      const secondLineTextWidth = this.estimateTextWidth(secondLineText, 10);
      
      let secondLineWillOverflow = false;
      
      if (helpers.direction < 0) {
        // Verificar overflow en lado izquierdo
        secondLineWillOverflow = (absoluteTextX - secondLineTextWidth - margin) < 0;
      } else {
        // Verificar overflow en lado derecho
        secondLineWillOverflow = (absoluteTextX + secondLineTextWidth + margin) > containerWidth;
      }
      
      if (secondLineWillOverflow) {
        // Si hay overflow, dividir en líneas separadas: Valor / Porcentaje
        textGroup.append("text")
          .text(value)
          .style("text-anchor", textAnchor)
          .style("font-size", "10px")
          .style("fill", "#666")
          .attr("dy", `${baseOffset}em`);
        
        textGroup.append("text")
          .text(percentage)
          .style("text-anchor", textAnchor)
          .style("font-size", "10px")
          .style("fill", "#666")
          .attr("dy", `${baseOffset + 1.2}em`);
      } else {
        // Sin overflow, usar formato normal
        textGroup.append("text")
          .text(secondLineText)
          .style("text-anchor", textAnchor)
          .style("font-size", "10px")
          .style("fill", "#666")
          .attr("dy", `${baseOffset}em`);
      }
    });
  }

  private getLineLengthForCategory(category: string, config: LineLengthConfig): number {
    if (config.mode === "all") {
      return config.globalLength;
    }
    return config.categoryLengths[category] || config.globalLength;
  }

  private estimateTextWidth(text: string, fontSize: number = 12): number {
    // Estimación más precisa basada en caracteres promedio
    return text.length * fontSize * 0.6;
  }

  private splitCategoryText(category: string, maxWidth: number, fontSize: number = 12): string[] {
    // Solo dividir si tiene espacios (múltiples palabras)
    if (!category.includes(' ')) {
      return [category]; // Una sola palabra, no dividir
    }
    
    const words = category.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.estimateTextWidth(testLine, fontSize);
      
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Si una sola palabra es muy larga, la agregamos completa
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [category];
  }

  private willTextOverflow(textX: number, text: string, direction: number, containerWidth: number, fontSize: number = 12): boolean {
    const textWidth = this.estimateTextWidth(text, fontSize);
    const margin = 10; // Margen de seguridad reducido
    const centerX = containerWidth / 2;
    
    // Ajustar textX desde el centro del contenedor
    const absoluteTextX = centerX + textX;
    
    if (direction > 0) {
      // Texto hacia la derecha
      return (absoluteTextX + textWidth + margin) > containerWidth;
    } else {
      // Texto hacia la izquierda (text-anchor="end")
      return (absoluteTextX - textWidth - margin) < 0;
    }
  }

  private getTextAnchor(d: d3.PieArcDatum<any>, radius: number, align: TextAlign): string {
    if (align !== "auto") {
      return align === "center" ? "middle" : align === "right" ? "end" : "start";
    }
    
    // Auto alignment basado en posición
    const helpers = this.getGeometryHelpers(d, radius);
    return helpers.direction > 0 ? "start" : "end";
  }
}

// 📈 Clase DataTransformer - Maneja transformación de datos
class DataTransformer {
  public static transform(dataView: powerbi.DataView): DonutDataPoint[] {
    if (!dataView?.categorical) return [];

    const categorical = dataView.categorical;
    
    const categories = categorical.categories?.[0]?.values;
    if (!categories || categories.length === 0) return [];

    const valueColumns = categorical.values || [];
    let dataPoints: Omit<DonutDataPoint, 'percentage'>[];
    
    if (valueColumns.length === 0) {
      dataPoints = categories.map((cat) => ({
        category: cat == null ? "(Blank)" : String(cat),
        value: 1
      }));
    } else {
      dataPoints = categories.map((cat, catIndex) => {
        const categoryName = cat == null ? "(Blank)" : String(cat);
        let totalValue = 0;

        valueColumns.forEach((valueColumn) => {
          const rawValue = valueColumn.values?.[catIndex];
          if (rawValue != null) {
            const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
            if (!isNaN(parsed) && isFinite(parsed)) {
              totalValue += parsed;
            }
          }
        });

        return { category: categoryName, value: totalValue };
      });
    }

    // Calcular total para porcentajes
    const total = dataPoints.reduce((sum, d) => sum + d.value, 0);
    
    // Agregar porcentajes
    return dataPoints.map(d => ({
      ...d,
      percentage: total > 0 ? (d.value / total) * 100 : 0
    }));
  }
}

// ⚙️ Clase FormattingManager - Maneja configuraciones de formato
class FormattingManager {
  public static getLineLengthMode(dataView: powerbi.DataView): LineLengthMode {
    if (dataView?.metadata?.objects?.labelTuning?.lineLengthMode) {
      return dataView.metadata.objects.labelTuning.lineLengthMode as LineLengthMode;
    }
    return DONUT_CONFIG.DEFAULT_LINE_MODE;
  }

  public static getGlobalLineLength(dataView: powerbi.DataView): number {
    if (dataView?.metadata?.objects?.labelTuning?.lineLength) {
      const value = dataView.metadata.objects.labelTuning.lineLength as number;
      return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  public static getCategoryLineLength(dataView: powerbi.DataView, categoryIndex: number): number {
    const propertyName = `lineLength_${categoryIndex}`;
    if (dataView?.metadata?.objects?.labelTuning?.[propertyName]) {
      const value = dataView.metadata.objects.labelTuning[propertyName] as number;
      return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  public static getLineLengthConfig(dataView: powerbi.DataView, viewModel: DonutDataPoint[]): LineLengthConfig {
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

  public static getWrap(dataView: powerbi.DataView): TextWrapMode {
    if (dataView?.metadata?.objects?.labelPlacement?.wrap !== undefined) {
      return dataView.metadata.objects.labelPlacement.wrap as TextWrapMode;
    }
    return DONUT_CONFIG.DEFAULT_WRAP;
  }



  public static createFormattingModel(dataView?: powerbi.DataView, viewModel?: DonutDataPoint[]): powerbi.visuals.FormattingModel {
    const mode = dataView ? this.getLineLengthMode(dataView) : DONUT_CONFIG.DEFAULT_LINE_MODE;
    const categories = viewModel ? viewModel.map(d => d.category) : [];
    
    // Crear slices dinámicos para Line Length
    const lineLengthSlices: powerbi.visuals.FormattingSlice[] = [
      {
        displayName: "Mode",
        uid: "lineLengthMode_slice",
        control: {
          type: powerbi.visuals.FormattingComponent.Dropdown,
          properties: {
            descriptor: {
              objectName: "labelTuning",
              propertyName: "lineLengthMode"
            },
            value: mode
          }
        }
      }
    ];

    // Agregar control global si está en modo "all" o como fallback en modo "individual"
    if (mode === "all" || categories.length === 0) {
      lineLengthSlices.push({
        displayName: "Line Length",
        uid: "lineLength_slice",
        control: {
          type: powerbi.visuals.FormattingComponent.NumUpDown,
          properties: {
            descriptor: {
              objectName: "labelTuning",
              propertyName: "lineLength"
            },
            value: dataView ? this.getGlobalLineLength(dataView) : DONUT_CONFIG.DEFAULT_LINE_LENGTH
          }
        }
      });
    }

    // Agregar controles individuales por categoría si está en modo "individual"
    if (mode === "individual" && categories.length > 0) {
      categories.slice(0, 10).forEach((category, index) => { // Limitar a 10 categorías
        const propertyName = `lineLength_${index}`;
        lineLengthSlices.push({
          displayName: `${category} - Line Length`,
          uid: `${propertyName}_slice`,
          control: {
            type: powerbi.visuals.FormattingComponent.NumUpDown,
            properties: {
              descriptor: {
                objectName: "labelTuning",
                propertyName: propertyName
              },
              value: dataView ? this.getCategoryLineLength(dataView, index) : DONUT_CONFIG.DEFAULT_LINE_LENGTH
            }
          }
        });
      });
    }

    return {
      cards: [
        {
          displayName: "Label and Line tuning",
          uid: "labelTuning_card",
          groups: [
            {
              displayName: undefined,
              uid: "labelTuning_group",
              slices: lineLengthSlices
            }
          ]
        },
        {
          displayName: "Label placement",
          uid: "labelPlacement_card",
          groups: [
            {
              displayName: undefined,
              uid: "labelPlacement_group",
              slices: [
                {
                  displayName: "Wrap",
                  uid: "wrap_slice",
                  control: {
                    type: powerbi.visuals.FormattingComponent.Dropdown,
                    properties: {
                      descriptor: {
                        objectName: "labelPlacement",
                        propertyName: "wrap"
                      },
                      value: dataView ? this.getWrap(dataView) : DONUT_CONFIG.DEFAULT_WRAP
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    };
  }
}

// 🎯 Clase Visual principal - Orchestrator simple y limpio
export class Visual implements powerbi.extensibility.visual.IVisual {
  private target: HTMLElement;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private renderer: DonutRenderer;
  private currentDataView: powerbi.DataView | undefined;
  private currentViewModel: DonutDataPoint[] = [];

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.target = options.element;
    this.svg = d3.select(this.target).append("svg");
    this.renderer = new DonutRenderer(this.svg);
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
    try {
      // Guardar datos actuales para FormattingModel dinámico
      this.currentDataView = options.dataViews?.[0];
      
      const { width, height } = options.viewport;
      
      // Preparar canvas
      this.svg
        .attr("width", width)
        .attr("height", height)
        .selectAll("*")
        .remove();

      // Transformar datos
      const viewModel = DataTransformer.transform(this.currentDataView);
      this.currentViewModel = viewModel;
      
      // Validar datos
      if (!this.isValidData(viewModel)) {
        this.renderer.renderNoData(width, height);
        return;
      }

      // Calcular configuración
      const config: RenderConfig = {
        radius: Math.min(width, height) / 2 - DONUT_CONFIG.MARGIN,
        lineLengthConfig: FormattingManager.getLineLengthConfig(this.currentDataView, viewModel),
        wrap: FormattingManager.getWrap(this.currentDataView),
        width,
        height
      };

      // Validar radius
      if (config.radius <= 0) return;

      // Renderizar
      this.renderer.render(viewModel, config);
      
    } catch (error) {
      console.error("Error rendering donut chart:", error);
      this.renderer.renderNoData(options.viewport.width, options.viewport.height);
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return FormattingManager.createFormattingModel(this.currentDataView, this.currentViewModel);
  }

  private isValidData(viewModel: DonutDataPoint[]): boolean {
    return viewModel && viewModel.length > 0 && viewModel.some(d => d.value > 0);
  }
}
