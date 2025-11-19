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

  public render(viewModel: DonutDataPoint[], config: RenderConfig, onSliceClick?: (category: string) => void, onBackClick?: () => void, isDrilled?: boolean, drillCategory?: string, showDrillHeader?: boolean): void {
    const { radius, lineLengthConfig, verticalPositionConfig, width, height, wrap, spacing, dataLabels } = config;
    
    // Limpiar SVG
    this.svg.selectAll("*").remove();
    
    // Render navigation buttons if in drill mode and header is enabled
    if (isDrilled && showDrillHeader) {
      this.renderNavigationButtons(width, height, onBackClick, drillCategory);
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
      this.renderLines(g, viewModel, pie, radius, lineLengthConfig, spacing);
      this.renderLabels(g, viewModel, pie, radius, lineLengthConfig, verticalPositionConfig, wrap, dataLabels, spacing);
    } else if (dataLabels.show && !isOutside) {
      // Renderizar labels inside sin líneas
      this.renderLabelsInside(g, viewModel, pie, dataLabels);
    }
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
  }

  private calculateTextPosition(helpers: GeometryHelpers, lineLength: number, category: string, verticalConfig: VerticalPositionConfig): [number, number] {
    const { mid, direction, outerRadius } = helpers;
    
    // Usar el mismo cálculo que en calculateLinePoints para consistencia
    const radialExtension = outerRadius + (outerRadius * 0.1);
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * radialExtension,
      Math.sin(mid - Math.PI / 2) * radialExtension
    ];
    
    // Calcular longitud proporcional idéntica a calculateLinePoints
    const baseLength = outerRadius * 0.3;
    const proportionalLength = baseLength * (lineLength / 50);
    // Spacing proporcional al radio
    const proportionalSpacing = (outerRadius * 0.08); // 8% del radio como spacing
    const textX = midPoint[0] + (proportionalLength * direction) + (proportionalSpacing * direction);
    const verticalOffset = this.getVerticalOffsetForCategory(category, verticalConfig);
    const textY = midPoint[1] + verticalOffset;
    
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
                     lineLengthConfig: LineLengthConfig,
                     spacing: SpacingConfig): void {
    g.selectAll("polyline")
      .data(pie(viewModel))
      .enter()
      .append("polyline")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("fill", "none")
      .attr("points", (d: d3.PieArcDatum<any>) => {
        const helpers = this.getGeometryHelpers(d, radius, spacing);
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
                      verticalPositionConfig: VerticalPositionConfig,
                      wrap: TextWrapMode,
                      dataLabels: DataLabelsConfig,
                      spacing: SpacingConfig): void {
    if (wrap === "wrap") {
      this.renderWrappedLabels(g, pie(viewModel), radius, lineLengthConfig, verticalPositionConfig, dataLabels, spacing);
    } else {
      this.renderSingleLabels(g, pie(viewModel), radius, lineLengthConfig, verticalPositionConfig, dataLabels, spacing);
    }
  }

  private renderSingleLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                            pieData: d3.PieArcDatum<DonutDataPoint>[],
                            radius: number,
                            lineLengthConfig: LineLengthConfig,
                            verticalPositionConfig: VerticalPositionConfig,
                            dataLabels: DataLabelsConfig,
                            spacing: SpacingConfig): void {
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius, spacing);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength, d.data.category, verticalPositionConfig);
      
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
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength, d.data.category, verticalPositionConfig);
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
    const adjustedLabels = this.resolveCollisions(labelInfos, dataLabels.fontSize, dataLabels.textSpacing);
    
    // Renderizar líneas que se ajustan automáticamente a las posiciones de los labels
    adjustedLabels.forEach((labelInfo) => {
      if (labelInfo.textY !== labelInfo.originalY) {
        // Label fue reposicionado - renderizar línea ajustada que sigue al label
        this.renderSmartAdjustedLine(g, labelInfo);
      } else {
        // Label en posición original - línea normal
        this.renderNormalLine(g, labelInfo);
      }
    });
    
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

  // Renderizar línea inteligente que se ajusta automáticamente al label
  private renderSmartAdjustedLine(g: d3.Selection<SVGGElement, unknown, null, undefined>, labelInfo: any): void {
    const helpers = labelInfo.helpers;
    const lineLength = labelInfo.lineLength;
    
    // Punto inicial: desde el borde del donut
    const startPoint = [
      Math.cos(helpers.mid - Math.PI / 2) * helpers.outerRadius,
      Math.sin(helpers.mid - Math.PI / 2) * helpers.outerRadius
    ];
    
    // Punto intermedio: extensión radial corta (proporcional al radio)
    const proportionalExtension = helpers.outerRadius * 0.1; // 10% del radio exterior
    const radialExtension = helpers.outerRadius + proportionalExtension;
    const midPoint = [
      Math.cos(helpers.mid - Math.PI / 2) * radialExtension,
      Math.sin(helpers.mid - Math.PI / 2) * radialExtension
    ];
    
    // Punto final: conectar automáticamente al inicio del label reposicionado
    const isRightSide = helpers.direction > 0;
    const proportionalMargin = helpers.outerRadius * 0.02; // 2% del radio como margen
    const labelStartX = isRightSide ? labelInfo.textX - proportionalMargin : labelInfo.textX + proportionalMargin;
    const finalPoint = [
      labelStartX,
      labelInfo.textY // Y ajustada automáticamente por el sistema de colisiones
    ];

    // Segmento 1: Línea radial desde el donut
    g.append("line")
      .attr("x1", startPoint[0])
      .attr("y1", startPoint[1])
      .attr("x2", midPoint[0])
      .attr("y2", midPoint[1])
      .attr("stroke", "#888")
      .attr("stroke-width", 1);
    
    // Segmento 2: Línea horizontal que busca automáticamente el inicio del label
    g.append("line")
      .attr("x1", midPoint[0])
      .attr("y1", midPoint[1])
      .attr("x2", finalPoint[0])
      .attr("y2", finalPoint[1])
      .attr("stroke", "#888")
      .attr("stroke-width", 1);
  }

  // Renderizar línea normal para labels no reposicionados
  private renderNormalLine(g: d3.Selection<SVGGElement, unknown, null, undefined>, labelInfo: any): void {
    const points = this.calculateLinePoints(labelInfo.helpers, labelInfo.lineLength);
    
    g.append("polyline")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("fill", "none")
      .attr("points", points.map((p) => p.join(",")).join(" "));
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
    const lineLengthConfig = this.getLineLengthConfig(dataView, viewModel, this.isDrilled);
    const verticalPositionConfig = this.getVerticalPositionConfig(dataView, viewModel, this.isDrilled);
    
    const dataLabelsConfig = this.getDataLabelsConfig(dataView, this.isDrilled);
    
    const config: RenderConfig = {
      radius,
      lineLengthConfig,
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

    // Get drill header configuration
    const showDrillHeader = this.formattingSettings.drillHeaderCard.show.value;
    
    // Renderizar
    this.renderer.render(viewModel, config, onSliceClick, onBackClick, this.isDrilled, this.drillCategory, showDrillHeader);
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