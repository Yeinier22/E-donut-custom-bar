/*
 * Power BI Visual - Pure D3 Implementation
 * Based on example/visual.ts
 */
"use strict";

import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
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

interface LineAngleConfig {
  mode: "auto" | "individual";
  categoryAngles: Record<string, number>;
}

interface VerticalPositionConfig {
  mode: "auto" | "individual";
  categoryOffsets: Record<string, number>;
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
  lineAngleConfig: LineAngleConfig;
  verticalPositionConfig: VerticalPositionConfig;
  width: number;
  height: number;
  wrap: TextWrapMode;
  spacing: SpacingConfig;
  dataLabels: DataLabelsConfig;
}

interface DataLabelsConfig {
  show: boolean;
  labelPlacement: string;
  placementMode: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontWeight: string;
  opacity: number;
  showBlankAs: string;
  displayUnit: string;
  valueDecimals: number;
  percentDecimals: number;
  valueType: string;
  textSpacing: number;
}

// 🎨 Clase DonutRenderer (copiada exactamente del ejemplo)
class DonutRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  constructor(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
    this.svg = svg;
  }

  public render(viewModel: DonutDataPoint[], config: RenderConfig, onSliceClick?: (category: string, event?: MouseEvent) => void, onBackClick?: () => void, isDrilled?: boolean, drillCategory?: string, showDrillHeader?: boolean): void {
    const { radius, lineLengthConfig, lineAngleConfig, verticalPositionConfig, width, height, wrap, spacing, dataLabels } = config;
    
    // Limpiar SVG
    this.svg.selectAll("*").remove();
    
    // Render navigation buttons if in drill mode
    if (isDrilled) {
      this.renderNavigationButtons(width, height, onBackClick, drillCategory, showDrillHeader);
    }
    
    // Calcular posición Y usando centerYPercent
    const centerY = (height * spacing.centerYPercent) / 100;
    
    const g = this.svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${centerY})`);

    // Configurar generadores D3 usando valores configurables de spacing
    const pie = d3.pie<any>().value((d: DonutDataPoint) => d.value);
    const arc = d3.arc<d3.PieArcDatum<DonutDataPoint>>()
      .innerRadius(radius * (spacing.innerRadiusPercent / 100))
      .outerRadius(radius * ((spacing.innerRadiusPercent + spacing.ringWidthPercent) / 100));
    const color = d3.scaleOrdinal(d3.schemeSet2);

    // Renderizar componentes
    this.renderDonut(g, viewModel, pie, arc, color, onSliceClick);
    
    // Solo renderizar líneas y labels si dataLabels están habilitados y en posición outside
    const isOutside = dataLabels.labelPlacement === "outside";
    if (dataLabels.show && isOutside) {
      this.renderLines(g, viewModel, pie, radius, lineLengthConfig, lineAngleConfig, spacing);
      this.renderLabels(g, viewModel, pie, radius, lineLengthConfig, lineAngleConfig, verticalPositionConfig, wrap, dataLabels, spacing);
    } else if (dataLabels.show && !isOutside) {
      // Renderizar labels inside sin líneas
      this.renderLabelsInside(g, viewModel, pie, dataLabels);
    }
  }

  private renderNavigationButtons(width: number, height: number, onBackClick?: () => void, drillCategory?: string, showDrillHeader?: boolean): void {
    // Back button - always show in drill mode
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
    
    // Title showing drill category - only show if showDrillHeader is true
    if (drillCategory && showDrillHeader) {
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

  private getGeometryHelpers(d: d3.PieArcDatum<any>, radius: number, spacing: SpacingConfig): GeometryHelpers {
    const mid = (d.startAngle + d.endAngle) / 2;
    const direction = mid < Math.PI ? 1 : -1;
    const outerRadiusRatio = (spacing.innerRadiusPercent + spacing.ringWidthPercent) / 100;
    return {
      mid,
      direction,
      outerRadius: radius * outerRadiusRatio,
      midRadius: radius * DONUT_CONFIG.LINE_START_RATIO // Este se mantiene para las líneas
    };
  }

  private calculateLinePoints(helpers: GeometryHelpers, lineLength: number): number[][] {
    const { mid, direction, outerRadius } = helpers;
    
    // Punto de inicio: desde el borde exterior del donut
    const startPoint = [
      Math.cos(mid - Math.PI / 2) * outerRadius,
      Math.sin(mid - Math.PI / 2) * outerRadius
    ];
    
    // Punto medio: pequeña extensión radial (proporcional al radio)
    const radialExtension = outerRadius + (outerRadius * 0.1); // 10% del radio como extensión
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * radialExtension,
      Math.sin(mid - Math.PI / 2) * radialExtension
    ];
    
    // Punto final: línea horizontal proporcional al radio
    // lineLength viene como valor 0-100, convertirlo a proporción del radio
    const baseLength = outerRadius * 0.3; // 30% del radio como longitud base
    const proportionalLength = baseLength * (lineLength / 50); // Normalizar: 50 = longitud base
    const finalPoint = [
      midPoint[0] + (proportionalLength * direction),
      midPoint[1]
    ];

    return [startPoint, midPoint, finalPoint];
  }  private calculateTextPosition(helpers: GeometryHelpers, lineLength: number, category: string, verticalConfig: VerticalPositionConfig, angleConfig: LineAngleConfig): [number, number] {
    const { mid, outerRadius } = helpers;
    
    // Obtener offset angular personalizado para esta categoría
    const angleOffset = this.getLineAngleForCategory(category, angleConfig);
    
    // Obtener offset vertical personalizado para esta categoría
    const verticalOffset = this.getVerticalOffsetForCategory(category, verticalConfig);
    
    // Extender radialmente desde el borde del slice con el ángulo ajustado
    const angle = (mid - Math.PI / 2) + angleOffset;
    const extension = outerRadius + lineLength;
    const textX = Math.cos(angle) * extension;
    const textY = Math.sin(angle) * extension + verticalOffset;
    
    return [textX, textY];
  }

  private renderDonut(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     viewModel: DonutDataPoint[], 
                     pie: d3.Pie<any, DonutDataPoint>, 
                     arc: d3.Arc<any, d3.PieArcDatum<DonutDataPoint>>,
                     color: d3.ScaleOrdinal<string, string, never>,
                     onSliceClick?: (category: string, event?: MouseEvent) => void): void {
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
        // Pasar tanto los datos como el evento del mouse
        const mouseEvent = d3.event as MouseEvent;
        onSliceClick(d.data.category, mouseEvent);
      } : null);
  }

  private renderLines(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     viewModel: DonutDataPoint[], 
                     pie: d3.Pie<any, DonutDataPoint>, 
                     radius: number, 
                     lineLengthConfig: LineLengthConfig,
                     lineAngleConfig: LineAngleConfig,
                     spacing: SpacingConfig): void {
    const pieData = pie(viewModel);
    
    pieData.forEach((d: d3.PieArcDatum<any>) => {
      const helpers = this.getGeometryHelpers(d, radius, spacing);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const lineAngle = this.getLineAngleForCategory(d.data.category, lineAngleConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength, d.data.category, { mode: 'auto', categoryOffsets: {} }, lineAngleConfig);
      
      // Punto de inicio: siempre en el punto medio del slice (sin ajuste de ángulo)
      const baseAngle = helpers.mid - Math.PI / 2;
      const x1 = Math.cos(baseAngle) * helpers.outerRadius;
      const y1 = Math.sin(baseAngle) * helpers.outerRadius;
      
      g.append("line")
        .attr("stroke", "#888")
        .attr("stroke-width", 1)
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", textX)
        .attr("y2", textY);
    });
  }

  private renderLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                      viewModel: DonutDataPoint[], 
                      pie: d3.Pie<any, DonutDataPoint>, 
                      radius: number, 
                      lineLengthConfig: LineLengthConfig,
                      lineAngleConfig: LineAngleConfig,
                      verticalPositionConfig: VerticalPositionConfig,
                      wrap: TextWrapMode,
                      dataLabels: DataLabelsConfig,
                      spacing: SpacingConfig): void {
    if (wrap === "wrap") {
      this.renderWrappedLabels(g, pie(viewModel), radius, lineLengthConfig, lineAngleConfig, verticalPositionConfig, dataLabels, spacing);
    } else {
      this.renderSingleLabels(g, pie(viewModel), radius, lineLengthConfig, lineAngleConfig, verticalPositionConfig, dataLabels, spacing);
    }
  }

  private renderSingleLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                            pieData: d3.PieArcDatum<DonutDataPoint>[],
                            radius: number,
                            lineLengthConfig: LineLengthConfig,
                            lineAngleConfig: LineAngleConfig,
                            verticalPositionConfig: VerticalPositionConfig,
                            dataLabels: DataLabelsConfig,
                            spacing: SpacingConfig): void {
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius, spacing);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength, d.data.category, verticalPositionConfig, lineAngleConfig);
      
      const labelText = this.formatLabelText(d.data, dataLabels.showBlankAs, dataLabels);
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      
      g.append("text")
        .text(labelText)
        .attr("transform", `translate(${textX}, ${textY})`)
        .style("text-anchor", textAnchor)
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity);
    });
  }

  private renderWrappedLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                             pieData: d3.PieArcDatum<DonutDataPoint>[],
                             radius: number,
                             lineLengthConfig: LineLengthConfig,
                             lineAngleConfig: LineAngleConfig,
                             verticalPositionConfig: VerticalPositionConfig,
                             dataLabels: DataLabelsConfig,
                             spacing: SpacingConfig): void {
    const containerWidth = parseInt(this.svg.attr("width")) || 400;
    const centerX = containerWidth / 2;
    const margin = 10;
    
    // Preparar información de todos los labels para detección de colisiones
    const labelInfos = pieData.map((d) => {
      const helpers = this.getGeometryHelpers(d, radius, spacing);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength, d.data.category, verticalPositionConfig, lineAngleConfig);
      const labelText = this.formatLabelText(d.data, dataLabels.showBlankAs, dataLabels);
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      const absoluteTextX = centerX + textX;
      
      // Obtener el layout que se usará para calcular dimensiones
      const availableWidth = helpers.direction < 0 ? absoluteTextX - margin : containerWidth - absoluteTextX - margin;
      const bestLayout = this.selectBestLayout(this.parseLabel(labelText), dataLabels.fontSize, availableWidth);
      
      return {
        d,
        helpers,
        lineLength,
        textX,
        textY: textY,
        labelText,
        textAnchor,
        absoluteTextX,
        bestLayout,
        originalY: textY,
        lineCount: bestLayout.lines.length
      };
    });
    
    // Aplicar separación automática anti-colisión
    const adjustedLabels = labelInfos;
    
    // Las líneas ya se renderizan en renderLines(), no duplicar aquí
    
    // Renderizar labels con posiciones ajustadas
    adjustedLabels.forEach((labelInfo) => {
      const textGroup = g.append("g")
        .attr("transform", `translate(${labelInfo.textX}, ${labelInfo.textY})`);

      this.renderAdaptiveText(
        textGroup, 
        labelInfo.labelText, 
        labelInfo.textAnchor, 
        dataLabels, 
        labelInfo.helpers, 
        labelInfo.lineLength, 
        labelInfo.absoluteTextX, 
        containerWidth, 
        margin
      );
    });
  }

  private resolveCollisions(labelInfos: any[], fontSize: number, textSpacing: number): any[] {
    const lineHeight = fontSize * (textSpacing / 10); // textSpacing viene como valor 0-20, convertir a multiplicador
    const minSeparation = lineHeight * 0.5; // Separación mínima entre labels
    
    // Separar labels por cuadrantes para evitar conflictos cross-quadrant
    const quadrants = {
      topRight: [] as any[],
      bottomRight: [] as any[],
      bottomLeft: [] as any[],
      topLeft: [] as any[]
    };
    
    labelInfos.forEach(label => {
      const quadrant = this.getQuadrant(label.helpers.mid);
      quadrants[quadrant].push(label);
    });
    
    // Resolver colisiones dentro de cada cuadrante
    Object.keys(quadrants).forEach(quadrantKey => {
      const quadrantLabels = quadrants[quadrantKey as keyof typeof quadrants];
      if (quadrantLabels.length > 1) {
        this.resolveQuadrantCollisions(quadrantLabels, lineHeight, minSeparation);
      }
    });
    
    return labelInfos;
  }

  private getQuadrant(angle: number): 'topRight' | 'bottomRight' | 'bottomLeft' | 'topLeft' {
    const normalizedAngle = angle % (2 * Math.PI);
    if (normalizedAngle >= 0 && normalizedAngle < Math.PI / 2) return 'topRight';
    if (normalizedAngle >= Math.PI / 2 && normalizedAngle < Math.PI) return 'bottomRight';
    if (normalizedAngle >= Math.PI && normalizedAngle < 3 * Math.PI / 2) return 'bottomLeft';
    return 'topLeft';
  }

  private resolveQuadrantCollisions(labels: any[], lineHeight: number, minSeparation: number): void {
    // Ordenar labels por posición Y original
    labels.sort((a, b) => a.originalY - b.originalY);
    
    for (let i = 0; i < labels.length; i++) {
      const currentLabel = labels[i];
      const currentHeight = currentLabel.lineCount * lineHeight;
      
      // Verificar colisiones con labels anteriores
      for (let j = 0; j < i; j++) {
        const previousLabel = labels[j];
        const previousHeight = previousLabel.lineCount * lineHeight;
        
        // Calcular límites verticales
        const currentTop = currentLabel.textY - currentHeight / 2;
        const currentBottom = currentLabel.textY + currentHeight / 2;
        const previousTop = previousLabel.textY - previousHeight / 2;
        const previousBottom = previousLabel.textY + previousHeight / 2;
        
        // Detectar colisión
        if (currentTop < previousBottom + minSeparation) {
          // Hay colisión, ajustar posición
          const newY = previousBottom + minSeparation + currentHeight / 2;
          currentLabel.textY = newY;
        }
      }
    }
  }

  private renderAdaptiveText(textGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
                            labelText: string,
                            textAnchor: string,
                            dataLabels: DataLabelsConfig,
                            helpers: GeometryHelpers,
                            lineLength: number,
                            absoluteTextX: number,
                            containerWidth: number,
                            margin: number): void {
    
    // Parsear el texto para extraer componentes
    const parts = this.parseLabel(labelText);
    
    // Calcular anchos disponibles según la dirección
    const availableWidth = helpers.direction < 0 
      ? absoluteTextX - margin
      : containerWidth - absoluteTextX - margin;
    
    // Seleccionar el mejor layout adaptativo según el espacio disponible
    const bestLayout = this.selectBestLayout(parts, dataLabels.fontSize, availableWidth);
    
    // Renderizar el layout seleccionado
    bestLayout.lines.forEach((line, index) => {
      textGroup.append("text")
        .text(line.text)
        .style("text-anchor", textAnchor)
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", line.isBold ? "bold" : dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity)
        .attr("dy", `${-0.3 + (index * (dataLabels.textSpacing / 10))}em`); // Usar textSpacing configurable
    });
  }

  private parseLabel(labelText: string): { category: string, value: string, percentage: string } {
    // Parsear texto como "Poor: 1.40M (34.13%)" 
    const colonIndex = labelText.indexOf(':');
    const openParenIndex = labelText.lastIndexOf('(');
    const closeParenIndex = labelText.lastIndexOf(')');
    
    if (colonIndex === -1 || openParenIndex === -1) {
      // Si no tiene el formato esperado, devolver como está
      return { category: labelText, value: '', percentage: '' };
    }
    
    const category = labelText.substring(0, colonIndex).trim();
    const value = labelText.substring(colonIndex + 1, openParenIndex).trim();
    const percentage = labelText.substring(openParenIndex + 1, closeParenIndex).trim();
    
    return { category, value, percentage };
  }

  private generateLayoutOptions(parts: { category: string, value: string, percentage: string }, fontSize: number) {
    const layouts = [];
    
    // Layout 1: Todo en una línea
    if (parts.value && parts.percentage) {
      layouts.push({
        lines: [{ text: `${parts.category}: ${parts.value} (${parts.percentage})`, isBold: false }],
        width: this.estimateTextWidth(`${parts.category}: ${parts.value} (${parts.percentage})`, fontSize)
      });
      
      // Layout 2: Categoría arriba, valor y % abajo
      layouts.push({
        lines: [
          { text: `${parts.category}:`, isBold: true },
          { text: `${parts.value} (${parts.percentage})`, isBold: false }
        ],
        width: Math.max(
          this.estimateTextWidth(`${parts.category}:`, fontSize),
          this.estimateTextWidth(`${parts.value} (${parts.percentage})`, fontSize)
        )
      });
      
      // Layout 3: Cada elemento en su línea
      layouts.push({
        lines: [
          { text: `${parts.category}:`, isBold: true },
          { text: parts.value, isBold: false },
          { text: `(${parts.percentage})`, isBold: false }
        ],
        width: Math.max(
          this.estimateTextWidth(`${parts.category}:`, fontSize),
          this.estimateTextWidth(parts.value, fontSize),
          this.estimateTextWidth(`(${parts.percentage})`, fontSize)
        )
      });
    } else {
      // Fallback para textos que no siguen el patrón
      layouts.push({
        lines: [{ text: `${parts.category}${parts.value}${parts.percentage}`, isBold: false }],
        width: this.estimateTextWidth(`${parts.category}${parts.value}${parts.percentage}`, fontSize)
      });
    }
    
    return layouts;
  }

  private generateAdaptiveLayoutOptions(parts: { category: string, value: string, percentage: string }, fontSize: number, maxWidth: number) {
    const adaptiveLayouts = [];
    
    // Generar layouts básicos primero
    const basicLayouts = this.generateLayoutOptions(parts, fontSize);
    
    // Para cada layout básico, crear versiones con wrap interno si es necesario
    basicLayouts.forEach(layout => {
      const adaptedLayout = {
        lines: [] as any[],
        width: 0
      };
      
      layout.lines.forEach(line => {
        const lineWidth = this.estimateTextWidth(line.text, fontSize);
        
        if (lineWidth > maxWidth && line.text.includes(' ')) {
          // Esta línea necesita wrap interno
          const wrappedLines = this.splitTextIntelligent(line.text, maxWidth, fontSize);
          wrappedLines.forEach((wrappedText, index) => {
            adaptedLayout.lines.push({
              text: wrappedText,
              isBold: line.isBold && index === 0 // Solo la primera línea mantiene el bold
            });
          });
          adaptedLayout.width = Math.max(adaptedLayout.width, maxWidth);
        } else {
          // Esta línea cabe completa
          adaptedLayout.lines.push(line);
          adaptedLayout.width = Math.max(adaptedLayout.width, lineWidth);
        }
      });
      
      adaptiveLayouts.push(adaptedLayout);
    });
    
    return adaptiveLayouts;
  }

  private selectBestLayout(parts: { category: string, value: string, percentage: string }, fontSize: number, availableWidth: number) {
    // Generar layouts adaptativos que incluyen wrap interno
    const adaptiveLayouts = this.generateAdaptiveLayoutOptions(parts, fontSize, availableWidth);
    
    // Seleccionar el layout más compacto que quepa en el espacio disponible
    for (const layout of adaptiveLayouts) {
      if (layout.width <= availableWidth) {
        return layout;
      }
    }
    // Si ninguno cabe, usar el último (más dividido y con wrap interno)
    return adaptiveLayouts[adaptiveLayouts.length - 1];
  }

  private renderWrappedText(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                           text: string, 
                           x: number, 
                           y: number, 
                           textAnchor: string, 
                           dataLabels: DataLabelsConfig,
                           radius: number): void {
    // Usar el sistema sofisticado del ejemplo con detección de overflow
    const containerWidth = parseInt(this.svg.attr("width")) || 800;
    const centerX = containerWidth / 2;
    const margin = 5;
    const absoluteTextX = centerX + x;
    
    // Determinar dirección (izquierda o derecha del centro)
    const direction = x >= 0 ? 1 : -1;
    
    // Estimar ancho del texto completo
    const fullTextWidth = this.estimateTextWidth(text, dataLabels.fontSize);
    
    // Verificar si habrá overflow
    let willOverflow = false;
    if (direction < 0) {
      willOverflow = (absoluteTextX - fullTextWidth - margin) < 0;
    } else {
      willOverflow = (absoluteTextX + fullTextWidth + margin) > containerWidth;
    }
    
    // Solo hacer wrap si hay overflow Y el texto tiene espacios
    let lines: string[];
    if (willOverflow && text.includes(' ')) {
      const maxWidth = Math.abs(x) * 1.8; // Ancho máximo basado en distancia del centro
      lines = this.splitTextIntelligent(text, maxWidth, dataLabels.fontSize);
    } else {
      lines = [text]; // Mantener en una línea
    }
    
    // Render cada línea
    const lineHeight = dataLabels.fontSize * (dataLabels.textSpacing / 10);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      g.append("text")
        .text(line)
        .attr("transform", `translate(${x}, ${startY + index * lineHeight})`)
        .style("text-anchor", textAnchor)
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity);
    });
  }

  private renderLabelsInside(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                           viewModel: DonutDataPoint[], 
                           pie: d3.Pie<any, DonutDataPoint>,
                           dataLabels: DataLabelsConfig): void {
    const pieData = pie(viewModel);
    pieData.forEach((d) => {
      // Calculate centroid for inside labels
      const angle = (d.startAngle + d.endAngle) / 2;
      const radius = 60; // Position inside the donut
      const centroid = [
        Math.cos(angle - Math.PI / 2) * radius,
        Math.sin(angle - Math.PI / 2) * radius
      ];
      
      const labelText = this.formatLabelText(d.data, dataLabels.showBlankAs, dataLabels);
      
      // Apply placement mode for inside labels too
      if (dataLabels.placementMode === "wrap") {
        this.renderWrappedTextInside(g, labelText, centroid[0], centroid[1], dataLabels, radius);
      } else {
        // Align mode - single line text
        g.append("text")
          .text(labelText)
          .attr("transform", `translate(${centroid[0]}, ${centroid[1]})`)
          .style("text-anchor", "middle")
          .style("font-family", dataLabels.fontFamily)
          .style("font-size", `${dataLabels.fontSize}px`)
          .style("font-style", dataLabels.fontStyle)
          .style("font-weight", dataLabels.fontWeight)
          .style("fill", dataLabels.color)
          .style("opacity", dataLabels.opacity);
      }
    });
  }

  private estimateTextWidth(text: string, fontSize: number = 12): number {
    // Estimación más precisa basada en caracteres promedio
    return text.length * fontSize * 0.6;
  }

  private splitTextIntelligent(text: string, maxWidth: number, fontSize: number = 12): string[] {
    // Solo dividir si tiene espacios (múltiples palabras)
    if (!text.includes(' ')) {
      return [text]; // Una sola palabra, no dividir
    }
    
    const words = text.split(' ');
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
    
    return lines.length > 0 ? lines : [text];
  }

  private renderWrappedTextInside(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                                 text: string, 
                                 x: number, 
                                 y: number, 
                                 dataLabels: DataLabelsConfig,
                                 radius: number): void {
    // Para labels internos, usar ancho máximo más conservador
    const maxWidth = Math.max(60, Math.floor(radius * 0.8));
    
    // Solo hacer wrap si el texto tiene espacios y es necesario
    let lines: string[];
    if (text.includes(' ') && this.estimateTextWidth(text, dataLabels.fontSize) > maxWidth) {
      lines = this.splitTextIntelligent(text, maxWidth, dataLabels.fontSize);
    } else {
      lines = [text];
    }
    
    // Render cada línea centrada
    const lineHeight = dataLabels.fontSize * 1.1;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      g.append("text")
        .text(line)
        .attr("transform", `translate(${x}, ${startY + index * lineHeight})`)
        .style("text-anchor", "middle")
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity);
    });
  }

  private formatLabelText(dataPoint: DonutDataPoint, showBlankAs: string, dataLabels: DataLabelsConfig): string {
    const category = dataPoint.category === "(Blank)" && showBlankAs ? showBlankAs : dataPoint.category;
    const formattedValue = this.formatValue(dataPoint.value, dataLabels);
    const formattedPercentage = dataPoint.percentage.toFixed(dataLabels.percentDecimals);
    return `${category}: ${formattedValue} (${formattedPercentage}%)`;
  }

  private formatValue(value: number, dataLabels: DataLabelsConfig): string {
    let formattedValue = value;
    let suffix = "";

    // Apply display units
    switch (dataLabels.displayUnit) {
      case "thousand":
        formattedValue = value / 1000;
        suffix = "K";
        break;
      case "million":
        formattedValue = value / 1000000;
        suffix = "M";
        break;
      case "billion":
        formattedValue = value / 1000000000;
        suffix = "B";
        break;
      case "auto":
        if (Math.abs(value) >= 1000000000) {
          formattedValue = value / 1000000000;
          suffix = "B";
        } else if (Math.abs(value) >= 1000000) {
          formattedValue = value / 1000000;
          suffix = "M";
        } else if (Math.abs(value) >= 1000) {
          formattedValue = value / 1000;
          suffix = "K";
        }
        break;
      case "none":
      default:
        formattedValue = value;
        break;
    }

    // Apply decimal places
    const decimals = dataLabels.valueDecimals;
    let valueString = formattedValue.toFixed(decimals);

    // Apply value type formatting
    switch (dataLabels.valueType) {
      case "currency":
        valueString = "$" + valueString;
        break;
      case "percent":
        valueString = valueString + "%";
        break;
      case "number":
      case "auto":
      default:
        // No additional formatting
        break;
    }

    return valueString + suffix;
  }

  private getLineLengthForCategory(category: string, config: LineLengthConfig): number {
    if (config.mode === "individual" && config.categoryLengths[category] !== undefined) {
      return config.categoryLengths[category];
    }
    return config.globalLength;
  }

  private getLineAngleForCategory(category: string, config: LineAngleConfig): number {
    if (config.mode === "individual" && config.categoryAngles[category] !== undefined) {
      return config.categoryAngles[category] * (Math.PI / 180); // Convertir grados a radianes
    }
    return 0; // Sin offset angular si está en modo auto
  }

  private getVerticalOffsetForCategory(category: string, config: VerticalPositionConfig): number {
    if (config.mode === "individual" && config.categoryOffsets[category] !== undefined) {
      return config.categoryOffsets[category];
    }
    return 0; // Sin offset si está en modo auto
  }

  private getTextAnchor(d: d3.PieArcDatum<any>, radius: number, align: TextAlign): string {
    if (align !== "auto") return align;
    const mid = (d.startAngle + d.endAngle) / 2;
    return mid < Math.PI ? "start" : "end";
  }

  // Renderizar línea simple que conecta al label reposicionado
  private renderSmartAdjustedLine(g: d3.Selection<SVGGElement, unknown, null, undefined>, labelInfo: any): void {
    const helpers = labelInfo.helpers;
    const angle = helpers.mid - Math.PI / 2;
    
    const x1 = Math.cos(angle) * helpers.outerRadius;
    const y1 = Math.sin(angle) * helpers.outerRadius;
    
    g.append("line")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("x1", x1)
      .attr("y1", y1)
      .attr("x2", labelInfo.textX - (helpers.direction * 8))
      .attr("y2", labelInfo.textY);
  }

  // Renderizar línea simple para labels no reposicionados
  private renderNormalLine(g: d3.Selection<SVGGElement, unknown, null, undefined>, labelInfo: any): void {
    const helpers = labelInfo.helpers;
    const angle = helpers.mid - Math.PI / 2;
    
    const x1 = Math.cos(angle) * helpers.outerRadius;
    const y1 = Math.sin(angle) * helpers.outerRadius;
    
    g.append("line")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("x1", x1)
      .attr("y1", y1)
      .attr("x2", labelInfo.textX - (helpers.direction * 8))
      .attr("y2", labelInfo.textY);
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
  private allDrillCategoryNames: string[] = []; // Nombres descriptivos para UI (hasta 10 categorías)
  
  // Cross-filtering system
  private selectionManager: ISelectionManager;
  private categorySelectionIds: { [key: string]: ISelectionId[] } = {};
  private drillSelectionIds: { [key: string]: ISelectionId[] } = {};

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.container = options.element;
    this.selectionManager = options.host.createSelectionManager();
    
    // Crear SVG
    this.svg = d3.select(this.container)
      .append("svg")
      .style("width", "100%")
      .style("height", "100%");
    
    this.renderer = new DonutRenderer(this.svg);
    this.formattingSettingsService = new FormattingSettingsService();
    this.formattingSettings = new VisualFormattingSettingsModel();
  }

  // Construir selection IDs para filtrado cruzado efectivo  
  private buildSelectionIds(viewModel: DonutDataPoint[]): void {
    this.categorySelectionIds = {};
    
    if (!this.dataView || !this.dataView.categorical) {
      return;
    }

    const categorical = this.dataView.categorical;
    const categories = categorical.categories || [];
    const values = categorical.values;
    
    if (categories.length === 0 || !categories[0].identity) {
      return;
    }

    const categoryValues = categories[0].values;
    
    // Crear mapa de categorías a índices
    const categoryToIndices: { [key: string]: number[] } = {};
    
    for (let i = 0; i < categoryValues.length; i++) {
      const categoryValue = categoryValues[i];
      const categoryKey = String(categoryValue);
      
      if (!categoryToIndices[categoryKey]) {
        categoryToIndices[categoryKey] = [];
      }
      categoryToIndices[categoryKey].push(i);
    }

    // Crear selection IDs comprehensivos para cada categoría
    for (const categoryKey in categoryToIndices) {
      const indices = categoryToIndices[categoryKey];
      const selectionIds: ISelectionId[] = [];
      
      try {
        // Crear múltiples IDs por categoría para asegurar filtrado robusto
        for (const rowIndex of indices) {
          // ID básico de categoría
          const basicId = this.host.createSelectionIdBuilder()
            .withCategory(categories[0], rowIndex)
            .createSelectionId();
          selectionIds.push(basicId);
          
          // IDs con series si existen
          const groups = (values as any)?.grouped?.() as any[] | undefined;
          if (Array.isArray(groups) && groups.length > 0) {
            for (const group of groups) {
              try {
                const seriesId = this.host.createSelectionIdBuilder()
                  .withCategory(categories[0], rowIndex)
                  .withSeries(values, group)
                  .createSelectionId();
                selectionIds.push(seriesId);
              } catch (e) {
                // Continuar si falla
              }
            }
          }
          
          // IDs con medidas individuales
          if (values && values.length > 0) {
            for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
              try {
                const measure = values[valueIndex];
                if (measure && measure.source && measure.source.queryName) {
                  const measureId = this.host.createSelectionIdBuilder()
                    .withCategory(categories[0], rowIndex)
                    .withMeasure(measure.source.queryName)
                    .createSelectionId();
                  selectionIds.push(measureId);
                }
              } catch (e) {
                // Continuar si falla
              }
            }
          }
        }
        
        this.categorySelectionIds[categoryKey] = selectionIds;
        console.log(`✅ Created ${selectionIds.length} selection IDs for category: "${categoryKey}"`);
        
      } catch (error) {
        console.error(`❌ Failed to create selection IDs for category: "${categoryKey}"`, error);
      }
    }
  }

  // Construir selection IDs para drill level
  private buildDrillSelectionIds(drillCategory: string): void {
    this.drillSelectionIds = {};

    if (!this.dataView || !this.dataView.categorical) {
      return;
    }

    const categorical = this.dataView.categorical;
    const categories = categorical.categories || [];
    
    if (categories.length < 2) {
      return;
    }

    const cat1Values = categories[0].values;
    const cat2Values = categories[1].values;
    const values = categorical.values;
    
    // Encontrar índices que coinciden con la categoría de drill
    const matchingIndices: number[] = [];
    for (let i = 0; i < cat1Values.length; i++) {
      if (String(cat1Values[i]) === drillCategory) {
        matchingIndices.push(i);
      }
    }
    
    if (matchingIndices.length === 0) {
      return;
    }
    
    // Agrupar por subcategoría
    const subcategoryToIndices: { [key: string]: number[] } = {};
    for (const index of matchingIndices) {
      const subcategoryValue = cat2Values[index];
      const subcategoryKey = String(subcategoryValue);
      
      if (!subcategoryToIndices[subcategoryKey]) {
        subcategoryToIndices[subcategoryKey] = [];
      }
      subcategoryToIndices[subcategoryKey].push(index);
    }
    
    // Crear selection IDs para cada subcategoría
    for (const subcategoryKey in subcategoryToIndices) {
      const indices = subcategoryToIndices[subcategoryKey];
      const selectionIds: ISelectionId[] = [];
      
      try {
        for (const rowIndex of indices) {
          // ID con ambas categorías
          const dualCategoryId = this.host.createSelectionIdBuilder()
            .withCategory(categories[0], rowIndex)
            .withCategory(categories[1], rowIndex)
            .createSelectionId();
          selectionIds.push(dualCategoryId);
          
          // IDs con series si existen
          const groups = (values as any)?.grouped?.() as any[] | undefined;
          if (Array.isArray(groups) && groups.length > 0) {
            for (const group of groups) {
              try {
                const seriesId = this.host.createSelectionIdBuilder()
                  .withCategory(categories[0], rowIndex)
                  .withCategory(categories[1], rowIndex)
                  .withSeries(values, group)
                  .createSelectionId();
                selectionIds.push(seriesId);
              } catch (e) {
                // Continuar si falla
              }
            }
          }
        }
        
        this.drillSelectionIds[subcategoryKey] = selectionIds;
        console.log(`✅ Created ${selectionIds.length} drill selection IDs for subcategory: "${subcategoryKey}"`);
        
      } catch (error) {
        console.error(`❌ Failed to create drill selection IDs for subcategory: "${subcategoryKey}"`, error);
      }
    }
  }

  // Sistema ultra-agresivo de selección para forzar filtrado de gráficos
  private handleSelection(category: string, isCtrlPressed: boolean = false): void {
    console.log(`🚀 AGGRESSIVE Cross-filtering for category: "${category}"`);
    console.log(`📊 Mode: ${this.isDrilled ? 'DRILL' : 'MAIN'}, Ctrl: ${isCtrlPressed}`);
    
    let selectionIds = this.isDrilled 
      ? this.drillSelectionIds[category] || []
      : this.categorySelectionIds[category] || [];

    // Si no hay IDs pre-construidos, crear dinámicamente
    if (selectionIds.length === 0) {
      console.log(`⚡ Creating dynamic selection IDs for: "${category}"`);
      selectionIds = this.createEmergencySelectionIds(category);
    }

    if (selectionIds.length === 0) {
      console.error(`❌ CRITICAL: No selection IDs available for: "${category}"`);
      return;
    }

    console.log(`🎯 Attempting selection with ${selectionIds.length} IDs...`);
    
    // ESTRATEGIA MULTI-NIVEL para asegurar filtrado
    this.executeMultiLevelSelection(selectionIds, isCtrlPressed, category);
  }
  
  // Ejecutar selección con múltiples estrategias simultáneas
  private executeMultiLevelSelection(selectionIds: ISelectionId[], isCtrlPressed: boolean, category: string): void {
    // NIVEL 1: Selección completa con todos los IDs
    this.selectionManager.select(selectionIds, isCtrlPressed).then(() => {
      console.log(`✅ LEVEL 1 SUCCESS: Full selection (${selectionIds.length} IDs) for "${category}"`);
      this.forceSelectionPropagation(category, selectionIds.length);
    }).catch((error) => {
      console.warn(`⚠️ LEVEL 1 FAILED: Trying alternative strategies...`, error);
      
      // NIVEL 2: Selección por grupos más pequeños
      this.tryGroupedSelection(selectionIds, isCtrlPressed, category);
    });
  }
  
  // Intentar selección por grupos más pequeños
  private tryGroupedSelection(selectionIds: ISelectionId[], isCtrlPressed: boolean, category: string): void {
    const groupSize = Math.max(1, Math.floor(selectionIds.length / 3));
    const groups = [];
    
    for (let i = 0; i < selectionIds.length; i += groupSize) {
      groups.push(selectionIds.slice(i, i + groupSize));
    }
    
    console.log(`🔄 LEVEL 2: Trying grouped selection (${groups.length} groups) for "${category}"`);
    
    let successfulGroups = 0;
    let totalAttempts = 0;
    
    groups.forEach((group, index) => {
      totalAttempts++;
      this.selectionManager.select(group, index > 0 || isCtrlPressed).then(() => {
        successfulGroups++;
        console.log(`✅ Group ${index + 1}/${groups.length} selected (${group.length} IDs)`);
        
        if (successfulGroups === 1) {
          // Al menos un grupo fue exitoso
          this.forceSelectionPropagation(category, group.length);
        }
      }).catch((groupError) => {
        console.warn(`⚠️ Group ${index + 1} failed:`, groupError);
        
        if (totalAttempts === groups.length && successfulGroups === 0) {
          // Si todos los grupos fallaron, intentar selección individual
          this.tryIndividualSelection(selectionIds, isCtrlPressed, category);
        }
      });
    });
  }
  
  // Selección individual como último recurso
  private tryIndividualSelection(selectionIds: ISelectionId[], isCtrlPressed: boolean, category: string): void {
    console.log(`🆘 LEVEL 3: Trying individual selection for "${category}"`);
    
    if (selectionIds.length > 0) {
      // Limpiar primero, luego seleccionar el ID más "básico"
      this.selectionManager.clear().then(() => {
        return this.selectionManager.select([selectionIds[0]], false);
      }).then(() => {
        console.log(`✅ LEVEL 3 SUCCESS: Individual selection for "${category}"`);
        this.forceSelectionPropagation(category, 1);
      }).catch((individualError) => {
        console.error(`❌ LEVEL 3 FAILED: All strategies exhausted for "${category}"`, individualError);
        
        // ÚLTIMO RECURSO: Forzar mediante timeout
        this.forceSelectionViaTimeout(category);
      });
    }
  }
  
  // Crear IDs de emergencia dinámicamente
  private createEmergencySelectionIds(category: string): ISelectionId[] {
    if (!this.dataView || !this.dataView.categorical) {
      return [];
    }
    
    const categorical = this.dataView.categorical;
    const categories = categorical.categories || [];
    const values = categorical.values;
    
    if (categories.length === 0) {
      return [];
    }
    
    const categoryValues = categories[0].values;
    const emergencyIds: ISelectionId[] = [];
    
    // Encontrar TODOS los índices que coinciden
    for (let i = 0; i < categoryValues.length; i++) {
      if (String(categoryValues[i]) === category) {
        try {
          // ID básico
          const basicId = this.host.createSelectionIdBuilder()
            .withCategory(categories[0], i)
            .createSelectionId();
          emergencyIds.push(basicId);
          
          // ID con cada medida disponible
          if (values && values.length > 0) {
            for (let j = 0; j < values.length; j++) {
              try {
                const measure = values[j];
                if (measure && measure.source) {
                  const measureId = this.host.createSelectionIdBuilder()
                    .withCategory(categories[0], i)
                    .withMeasure(measure.source.queryName || measure.source.displayName || `m${j}`)
                    .createSelectionId();
                  emergencyIds.push(measureId);
                }
              } catch (e) {
                // Continuar con otras medidas
              }
            }
          }
        } catch (error) {
          console.warn(`Failed emergency ID for index ${i}`);
        }
      }
    }
    
    console.log(`🚨 Created ${emergencyIds.length} emergency IDs for "${category}"`);
    return emergencyIds;
  }
  
  // Forzar propagación con timeout y verificación
  private forceSelectionPropagation(category: string, idCount: number): void {
    // Propagación inmediata
    this.ensureSelectionPropagation();
    
    // Verificación y repropagación después de 100ms
    setTimeout(() => {
      console.log(`🔄 Re-propagating selection for "${category}" (${idCount} IDs)`);
      this.ensureSelectionPropagation();
      
      // Verificación final después de 300ms
      setTimeout(() => {
        console.log(`✅ Final propagation check for "${category}"`);
        this.logCurrentSelectionState();
      }, 300);
    }, 100);
  }
  
  // Último recurso: forzar mediante timeout
  private forceSelectionViaTimeout(category: string): void {
    console.log(`⏰ TIMEOUT STRATEGY: Forcing selection for "${category}"`);
    
    setTimeout(() => {
      if (this.categorySelectionIds[category] && this.categorySelectionIds[category].length > 0) {
        const id = this.categorySelectionIds[category][0];
        this.selectionManager.select([id], false).then(() => {
          console.log(`✅ TIMEOUT SUCCESS for "${category}"`);
          this.forceSelectionPropagation(category, 1);
        }).catch(() => {
          console.error(`❌ TIMEOUT FAILED for "${category}"`);
        });
      }
    }, 50);
  }

  // Asegurar propagación de selección
  private ensureSelectionPropagation(): void {
    setTimeout(() => {
      console.log("🔄 Selection propagation complete - other visuals should be filtered");
      this.logCurrentSelectionState();
    }, 50);
  }

  // Log del estado actual de selección
  private logCurrentSelectionState(): void {
    try {
      const currentSelections = this.selectionManager.getSelectionIds();
      console.log("📊 Current selection IDs count:", (currentSelections as any)?.length || 0);
    } catch (error) {
      console.log("⚠️ Could not retrieve current selection state");
    }
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

    // Construir selection IDs para filtrado cruzado
    this.buildSelectionIds(viewModel);
    if (this.isDrilled && this.drillCategory) {
      this.buildDrillSelectionIds(this.drillCategory);
    }

    // Configurar renderizado con spacing settings
    const spacingConfig = this.getSpacingConfig(dataView);
    const radius = Math.min(options.viewport.width, options.viewport.height) / 2 - DONUT_CONFIG.MARGIN;
    const lineLengthConfig = this.getLineLengthConfig(dataView, viewModel, this.isDrilled);
    const lineAngleConfig = this.getLineAngleConfig(dataView, viewModel, this.isDrilled);
    const verticalPositionConfig = this.getVerticalPositionConfig(dataView, viewModel, this.isDrilled);
    
    const dataLabelsConfig = this.getDataLabelsConfig(dataView, this.isDrilled);
    
    const config: RenderConfig = {
      radius,
      lineLengthConfig,
      lineAngleConfig,
      verticalPositionConfig,
      width: options.viewport.width,
      height: options.viewport.height,
      wrap: DONUT_CONFIG.DEFAULT_WRAP,
      spacing: spacingConfig,
      dataLabels: dataLabelsConfig
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
    
    // Click handlers con filtrado cruzado y soporte para Ctrl+Click
    const onSliceClick = !this.isDrilled ? (category: string, event?: MouseEvent) => {
      // 🎯 PASO 1: Aplicar filtrado cruzado ANTES del drill down
      // Detectar Ctrl+Click para selección múltiple
      const isCtrlPressed = event?.ctrlKey || false;
      this.handleSelection(category, isCtrlPressed);
      
      // 🔍 PASO 2: Verificar si hay drill down disponible (solo si no es Ctrl+Click)
      if (!isCtrlPressed) {
        const clickedIndex = this.currentCategories.indexOf(category);
        const clickedKey = clickedIndex >= 0 && this.baseCategories && clickedIndex < this.baseCategories.length
          ? this.baseCategories[clickedIndex]
          : category;
        
        const drillData = this.buildDrillData(dataView, category);
        if (drillData && drillData.length > 0) {
          // 📊 PASO 3: Ejecutar drill down (mantener filtro activo)
          this.isDrilled = true;
          this.drillCategory = category;
          this.drillCategoryKey = clickedKey;
          this.currentCategories = drillData.map(d => d.category);
          
          // Generar nombres para todos los controles
          this.allDrillCategoryNames = this.generateAllCategoryNames(dataView);
          
          this.update(options); // Re-render with drill data
        }
      }
    } : (category: string, event?: MouseEvent) => {
      // En modo drill: solo aplicar filtrado cruzado de subcategorías
      const isCtrlPressed = event?.ctrlKey || false;
      this.handleSelection(category, isCtrlPressed);
    };
    
    const onBackClick = this.isDrilled ? () => {
      this.isDrilled = false;
      this.drillCategory = null;
      this.drillCategoryKey = null;
      this.currentCategories = [...this.baseCategories];
      this.allDrillCategoryNames = []; // Limpiar nombres
      this.update(options); // Re-render with main data
    } : undefined;

    // Get drill header configuration
    const showDrillHeader = this.formattingSettings.drillHeaderCard.show.value;
    
    // Renderizar
    this.renderer.render(viewModel, config, onSliceClick, onBackClick, this.isDrilled, this.drillCategory, showDrillHeader);
    
    // 🎯 Configurar eventos para filtrado cruzado
    this.setupCrossFilteringEvents();
  }

  // Configurar eventos de filtrado cruzado
  private setupCrossFilteringEvents(): void {
    // Limpiar selecciones al hacer click en área vacía
    this.svg.on("click", () => {
      const event = d3.event as MouseEvent;
      // Solo limpiar si el click es en el SVG directamente, no en elementos hijos
      if (event.target === this.svg.node()) {
        console.log("🧹 Clearing selections...");
        this.selectionManager.clear().then(() => {
          console.log("✅ Selections cleared");
        }).catch((error) => {
          console.error("❌ Failed to clear selections:", error);
        });
      }
    });

    // Escuchar cambios de selección desde otros visuales
    this.selectionManager.registerOnSelectCallback((selectionIds: ISelectionId[]) => {
      console.log("🔄 External selection change detected:", selectionIds ? selectionIds.length : 0, "IDs");
      
      if (selectionIds && selectionIds.length > 0) {
        console.log("📊 Visual responding to external selection changes");
      } else {
        console.log("🧹 External selections cleared");
      }
      
      // Aquí podrías agregar lógica para resaltar visualmente los elementos seleccionados
      // basándose en las selecciones externas, si es necesario
    });
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

  private generateAllCategoryNames(dataView: powerbi.DataView): string[] {
    const names: string[] = [];
    const categorical = dataView.categorical;
    
    console.log("🔍 generateAllCategoryNames - categorical:", categorical);
    console.log("🔍 generateAllCategoryNames - categories length:", categorical?.categories?.length);
    console.log("🔍 generateAllCategoryNames - isDrilled:", this.isDrilled);
    console.log("🔍 generateAllCategoryNames - baseCategories:", this.baseCategories);
    
    // Si estamos en modo drill, generar combinaciones basadas en los datos actuales
    if (this.isDrilled && categorical && categorical.categories && categorical.categories.length > 0) {
      console.log("🎯 Generando nombres de drill desde datos actuales");
      
      // En modo drill, usar las categorías actuales del drill
      const drillCategories = categorical.categories[0].values;
      const uniqueDrillCategories = [];
      const seen = new Set();
      
      for (const cat of drillCategories) {
        const catStr = String(cat);
        if (!seen.has(catStr)) {
          seen.add(catStr);
          uniqueDrillCategories.push(catStr);
        }
      }
      
      console.log("🔍 Categorías únicas del drill:", uniqueDrillCategories);
      
      // Usar las categorías de drill directamente
      uniqueDrillCategories.forEach((category, index) => {
        if (index < 10) {
          names.push(category);
        }
      });
      
      // Completar hasta 10 con nombres genéricos si es necesario
      for (let i = names.length; i < 10; i++) {
        names.push(`Category ${i}`);
      }
      
      console.log("🏷️ Nombres generados desde drill actual:", names);
      return names;
    }
    
    if (!categorical || !categorical.categories || categorical.categories.length < 2) {
      // Si no hay estructura de drill, usar nombres genéricos
      for (let i = 0; i < 10; i++) {
        names.push(`Category ${i}`);
      }
      console.log("🏷️ Nombres genéricos (sin estructura drill):", names);
      return names;
    }

    const cat1 = categorical.categories[0].values;
    const cat2 = categorical.categories[1].values;
    const rowCount = (cat1 as any[]).length;

    console.log("📊 Datos de categorías:");
    console.log("  - cat1 (primera categoría):", cat1);
    console.log("  - cat2 (segunda categoría):", cat2);
    console.log("  - rowCount:", rowCount);

    // Crear un mapa ordenado de todas las combinaciones únicas
    const combinationsOrder: string[] = [];
    const seen = new Set<string>();
    
    for (let i = 0; i < rowCount; i++) {
      const category1 = String(cat1[i] || '');
      const category2 = String(cat2[i] || '');
      
      if (category1 && category2) {
        const combinationKey = `${category1}-${category2}`;
        if (!seen.has(combinationKey)) {
          seen.add(combinationKey);
          combinationsOrder.push(combinationKey);
        }
      }
    }
    
    // Debug: ver qué combinaciones estamos generando
    console.log("🔍 Generando nombres para drill:", combinationsOrder);
    
    // Asignar hasta 10 nombres basándose en las combinaciones reales
    for (let i = 0; i < 10; i++) {
      if (i < combinationsOrder.length) {
        names.push(combinationsOrder[i]);
      } else {
        names.push(`Category ${i}`); // Fallback para índices sin combinaciones
      }
    }
    
    console.log("🏷️ Nombres finales generados:", names);
    return names;
  }

  private getLineLengthConfig(dataView: powerbi.DataView, viewModel: DonutDataPoint[], isDrilled: boolean): LineLengthConfig {
    const mode = this.getLineLengthMode(dataView, isDrilled);
    const globalLength = this.getGlobalLineLength(dataView, isDrilled);
    const categoryLengths: Record<string, number> = {};

    if (mode === "individual") {
      viewModel.forEach((d, index) => {
        categoryLengths[d.category] = this.getCategoryLineLength(dataView, index, isDrilled);
      });
    }

    return {
      mode,
      globalLength,
      categoryLengths
    };
  }

  private getVerticalPositionConfig(dataView: powerbi.DataView, viewModel: DonutDataPoint[], isDrilled: boolean): VerticalPositionConfig {
    const mode = this.getVerticalPositionMode(dataView, isDrilled);
    const categoryOffsets: Record<string, number> = {};

    if (mode === "individual") {
      viewModel.forEach((d, index) => {
        categoryOffsets[d.category] = this.getCategoryVerticalOffset(dataView, index, isDrilled);
      });
    }

    return {
      mode,
      categoryOffsets
    };
  }

  private getLineAngleConfig(dataView: powerbi.DataView, viewModel: DonutDataPoint[], isDrilled: boolean): LineAngleConfig {
    const mode = this.getLineAngleMode(dataView, isDrilled);
    const categoryAngles: Record<string, number> = {};

    if (mode === "individual") {
      viewModel.forEach((d, index) => {
        categoryAngles[d.category] = this.getCategoryLineAngle(dataView, index, isDrilled);
      });
    }

    return {
      mode,
      categoryAngles
    };
  }

  private getVerticalPositionMode(dataView: powerbi.DataView, isDrilled: boolean): "auto" | "individual" {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const mode = String(tuningCard.verticalPositionMode.value.value);
    return (mode === "individual" ? "individual" : "auto");
  }

  private getCategoryVerticalOffset(dataView: powerbi.DataView, index: number, isDrilled: boolean): number {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const propertyName = `verticalOffset_${index}` as keyof typeof tuningCard;
    const control = tuningCard[propertyName] as any;
    if (control && control.value !== undefined) {
      const value = control.value;
      return Math.max(-100, Math.min(100, value)); // Limitar entre -100 y +100
    }
    return 0; // Sin offset por defecto
  }

  private getLineAngleMode(dataView: powerbi.DataView, isDrilled: boolean): "auto" | "individual" {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const mode = String(tuningCard.lineAngleMode.value.value);
    return (mode === "individual" ? "individual" : "auto");
  }

  private getCategoryLineAngle(dataView: powerbi.DataView, index: number, isDrilled: boolean): number {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const propertyName = `lineAngle_${index}` as keyof typeof tuningCard;
    const control = tuningCard[propertyName] as any;
    if (control && control.value !== undefined) {
      const value = control.value;
      return Math.max(-90, Math.min(90, value)); // Limitar entre -90° y +90°
    }
    return 0; // Sin ángulo por defecto
  }

  private getLineLengthMode(dataView: powerbi.DataView, isDrilled: boolean): LineLengthMode {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const mode = String(tuningCard.lineLengthMode.value.value);
    return (mode === "individual" ? "individual" : "all") as LineLengthMode;
  }

  private getGlobalLineLength(dataView: powerbi.DataView, isDrilled: boolean): number {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const value = tuningCard.lineLength.value;
    if (typeof value === 'number' && !isNaN(value)) {
      return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getCategoryLineLength(dataView: powerbi.DataView, categoryIndex: number, isDrilled: boolean): number {
    const tuningCard = isDrilled ? this.formattingSettings.labelTuningDrillCard : this.formattingSettings.labelTuningCard;
    const propertyName = `lineLength_${categoryIndex}` as keyof typeof tuningCard;
    const control = tuningCard[propertyName] as any;
    if (control && control.value !== undefined) {
      const value = control.value;
      if (typeof value === 'number' && !isNaN(value)) {
        return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
      }
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getSpacingConfig(dataView: powerbi.DataView): SpacingConfig {
    // Usar formattingSettings en lugar de dataView.metadata.objects para consistencia
    const spacingCard = this.formattingSettings.spacingCard;
    
    return {
      innerRadiusPercent: spacingCard.innerRadiusPercent.value,
      ringWidthPercent: spacingCard.ringWidthPercent.value, 
      centerYPercent: spacingCard.centerYPercent.value
    };
  }

  private clampValue(value: any, defaultValue: number, min: number, max: number): number {
    if (typeof value === 'number' && !isNaN(value)) {
      return Math.max(min, Math.min(max, value));
    }
    return defaultValue;
  }

  private getDataLabelsConfig(dataView: powerbi.DataView, isDrilled: boolean): DataLabelsConfig {
    // Use FormattingSettings values - main dataLabelsCard has all the UI properties
    const dataLabelsCard = this.formattingSettings.dataLabelsCard;
    const drillCard = this.formattingSettings.dataLabelsDrillCard;
    
    return {
      show: dataLabelsCard.show.value,
      labelPlacement: String(dataLabelsCard.labelPlacement.value.value),
      placementMode: String(dataLabelsCard.placementMode.value.value),
      color: dataLabelsCard.color.value.value,
      fontFamily: dataLabelsCard.fontFamily.value,
      fontSize: dataLabelsCard.fontSize.value,
      fontStyle: "normal",
      fontWeight: "normal",  
      opacity: 1,
      showBlankAs: "",
      // Drill-specific formatting (if in drill mode, use drill values for number formatting)
      displayUnit: String(isDrilled ? drillCard.displayUnit.value.value : dataLabelsCard.displayUnit.value.value),
      valueDecimals: isDrilled ? drillCard.valueDecimals.value : dataLabelsCard.valueDecimals.value,
      percentDecimals: isDrilled ? drillCard.percentDecimals.value : dataLabelsCard.percentDecimals.value,
      valueType: String(isDrilled ? drillCard.valueType.value.value : dataLabelsCard.valueType.value.value),
      textSpacing: this.formattingSettings.labelTuningCard.textSpacing.value
    };
  }



  public getFormattingModel(): powerbi.visuals.FormattingModel {
    console.log("🎛️ getFormattingModel - isDrilled:", this.isDrilled);
    console.log("🎛️ getFormattingModel - allDrillCategoryNames:", this.allDrillCategoryNames);
    
    // Generar nombres para todos los controles si estamos en drill y tenemos datos
    if (this.isDrilled && this.dataView) {
      console.log("🔄 Generando nombres para drill (forzado)...");
      this.allDrillCategoryNames = this.generateAllCategoryNames(this.dataView);
    }
    
    // Actualizar visibilidad de slices según el modo
    const isIndividualMode = this.formattingSettings.labelTuningCard.lineLengthMode.value.value === "individual";
    const isVerticalIndividualMode = this.formattingSettings.labelTuningCard.verticalPositionMode.value.value === "individual";
    
    // Controlar visibilidad de configuraciones individuales de línea
    this.formattingSettings.labelTuningCard.lineLength.visible = !isIndividualMode;
    
    // Configurar slices individuales de línea con nombres de categorías si están disponibles
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
      slice.visible = isIndividualMode && index < this.baseCategories.length;
      if (isIndividualMode && this.baseCategories && this.baseCategories[index]) {
        slice.displayName = `${this.baseCategories[index]} Line Length`;
      } else {
        slice.displayName = `Category ${index} Line Length`;
      }
    });

    // Configurar slices individuales de posición vertical con nombres de categorías reales
    const verticalOffsetSlices = [
      this.formattingSettings.labelTuningCard.verticalOffset_0,
      this.formattingSettings.labelTuningCard.verticalOffset_1,
      this.formattingSettings.labelTuningCard.verticalOffset_2,
      this.formattingSettings.labelTuningCard.verticalOffset_3,
      this.formattingSettings.labelTuningCard.verticalOffset_4,
      this.formattingSettings.labelTuningCard.verticalOffset_5,
      this.formattingSettings.labelTuningCard.verticalOffset_6,
      this.formattingSettings.labelTuningCard.verticalOffset_7,
      this.formattingSettings.labelTuningCard.verticalOffset_8,
      this.formattingSettings.labelTuningCard.verticalOffset_9
    ];
    
    verticalOffsetSlices.forEach((slice, index) => {
      slice.visible = isVerticalIndividualMode && index < this.baseCategories.length;
      if (isVerticalIndividualMode && this.baseCategories && this.baseCategories[index]) {
        slice.displayName = `${this.baseCategories[index]} Vertical Offset`;
      } else {
        slice.displayName = `Category ${index} Vertical Offset`;
      }
    });
    
    // ========== CONFIGURACIÓN PARA DRILL DOWN ==========
    // Actualizar visibilidad de slices según el modo para drill
    const isDrillIndividualMode = this.formattingSettings.labelTuningDrillCard.lineLengthMode.value.value === "individual";
    const isDrillVerticalIndividualMode = this.formattingSettings.labelTuningDrillCard.verticalPositionMode.value.value === "individual";
    
    // Controlar visibilidad de configuraciones individuales de línea para drill
    this.formattingSettings.labelTuningDrillCard.lineLength.visible = !isDrillIndividualMode;
    
    // Configurar slices individuales de línea con nombres de categorías de drill si están disponibles
    const drillIndividualSlices = [
      this.formattingSettings.labelTuningDrillCard.lineLength_0,
      this.formattingSettings.labelTuningDrillCard.lineLength_1,
      this.formattingSettings.labelTuningDrillCard.lineLength_2,
      this.formattingSettings.labelTuningDrillCard.lineLength_3,
      this.formattingSettings.labelTuningDrillCard.lineLength_4,
      this.formattingSettings.labelTuningDrillCard.lineLength_5,
      this.formattingSettings.labelTuningDrillCard.lineLength_6,
      this.formattingSettings.labelTuningDrillCard.lineLength_7,
      this.formattingSettings.labelTuningDrillCard.lineLength_8,
      this.formattingSettings.labelTuningDrillCard.lineLength_9
    ];
    
    drillIndividualSlices.forEach((slice, index) => {
      const hasRealName = this.allDrillCategoryNames && this.allDrillCategoryNames[index] && !this.allDrillCategoryNames[index].startsWith('Category ');
      slice.visible = isDrillIndividualMode && (hasRealName || index < 8); // Mostrar los primeros 8 siempre, o si tiene nombre real
      
      if (isDrillIndividualMode && hasRealName) {
        slice.displayName = `${this.allDrillCategoryNames[index]} Line Length`;
        console.log(`✅ Slice ${index} configurado con nombre: ${slice.displayName}`);
      } else {
        slice.displayName = `Category ${index} Line Length`;
        console.log(`❌ Slice ${index} usando nombre genérico: ${slice.displayName} (hasRealName: ${hasRealName})`);
      }
    });

    // Configurar slices individuales de posición vertical con nombres de categorías de drill
    const drillVerticalOffsetSlices = [
      this.formattingSettings.labelTuningDrillCard.verticalOffset_0,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_1,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_2,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_3,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_4,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_5,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_6,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_7,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_8,
      this.formattingSettings.labelTuningDrillCard.verticalOffset_9
    ];
    
    drillVerticalOffsetSlices.forEach((slice, index) => {
      const hasRealName = this.allDrillCategoryNames && this.allDrillCategoryNames[index] && !this.allDrillCategoryNames[index].startsWith('Category ');
      slice.visible = isDrillVerticalIndividualMode && (hasRealName || index < 8); // Mostrar los primeros 8 siempre, o si tiene nombre real
      
      if (isDrillVerticalIndividualMode && hasRealName) {
        slice.displayName = `${this.allDrillCategoryNames[index]} Vertical Offset`;
        console.log(`✅ VOffset ${index} configurado con nombre: ${slice.displayName}`);
      } else {
        slice.displayName = `Category ${index} Vertical Offset`;
        console.log(`❌ VOffset ${index} usando nombre genérico: ${slice.displayName} (hasRealName: ${hasRealName})`);
      }
    });
    
    // Control data labels visibility based on show toggle
    const dataLabelsEnabled = this.formattingSettings.dataLabelsCard.show.value;
    this.formattingSettings.dataLabelsCard.labelPlacement.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.placementMode.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.fontFamily.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.fontSize.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.color.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.displayUnit.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.valueDecimals.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.valueType.visible = dataLabelsEnabled;
    
    return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
  }
}