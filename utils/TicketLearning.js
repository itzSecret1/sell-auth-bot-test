/**
 * Ticket Learning System
 * Aprende de los tickets cerrados para mejorar respuestas y sugerencias
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const LEARNING_FILE = './ticketLearning.json';
const TICKETS_FILE = './tickets.json';

// Estructura de datos de aprendizaje
let learningData = {
  categories: {},           // { category: { count, avgResolutionTime, commonIssues: [] } }
  commonIssues: {},         // { issue: { count, category, solution } }
  resolutionTimes: [],      // Array de tiempos de resolución en minutos
  staffPerformance: {},    // { staffId: { ticketsHandled, avgRating, avgResolutionTime } }
  patterns: {},             // Patrones detectados (ej: "product_not_received" + "invoice_123" = solución común)
  lastUpdated: null
};

/**
 * Cargar datos de aprendizaje
 */
function loadLearningData() {
  try {
    if (existsSync(LEARNING_FILE)) {
      const data = readFileSync(LEARNING_FILE, 'utf-8');
      learningData = JSON.parse(data);
    }
  } catch (error) {
    console.error('[TICKET-LEARNING] Error loading learning data:', error);
    learningData = {
      categories: {},
      commonIssues: {},
      resolutionTimes: [],
      staffPerformance: {},
      patterns: {},
      lastUpdated: null
    };
  }
}

/**
 * Guardar datos de aprendizaje
 */
function saveLearningData() {
  try {
    learningData.lastUpdated = new Date().toISOString();
    writeFileSync(LEARNING_FILE, JSON.stringify(learningData, null, 2), 'utf-8');
  } catch (error) {
    console.error('[TICKET-LEARNING] Error saving learning data:', error);
  }
}

/**
 * Calcular tiempo de resolución en minutos
 */
function calculateResolutionTime(createdAt, closedAt) {
  if (!createdAt || !closedAt) return null;
  
  const created = new Date(createdAt);
  const closed = new Date(closedAt);
  const diffMs = closed - created;
  return Math.round(diffMs / (1000 * 60)); // Convertir a minutos
}

/**
 * Extraer palabras clave de un texto (para detectar problemas comunes)
 */
function extractKeywords(text) {
  if (!text) return [];
  
  // Palabras comunes a ignorar
  const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o', 'a', 'que', 'es', 'son', 'fue', 'ser', 'tiene', 'tengo', 'tienes', 'tiene', 'para', 'por', 'con', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'hacia', 'durante', 'mediante', 'según', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remover puntuación
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.includes(word));
  
  return words;
}

/**
 * Analizar un ticket cerrado y aprender de él
 */
export function learnFromTicket(ticket) {
  try {
    if (!ticket || !ticket.closed) {
      return; // Solo aprender de tickets cerrados
    }

    loadLearningData();

    const category = ticket.category || 'unknown';
    const resolutionTime = calculateResolutionTime(ticket.createdAt, ticket.closedAt);
    const closeReason = ticket.closeReason || '';
    const invoiceId = ticket.invoiceId || null;
    const staffId = ticket.claimedBy || ticket.closedBy || null;

    // Aprender sobre categorías
    if (!learningData.categories[category]) {
      learningData.categories[category] = {
        count: 0,
        avgResolutionTime: 0,
        totalResolutionTime: 0,
        commonIssues: []
      };
    }

    learningData.categories[category].count++;
    if (resolutionTime !== null) {
      learningData.categories[category].totalResolutionTime += resolutionTime;
      learningData.categories[category].avgResolutionTime = 
        Math.round(learningData.categories[category].totalResolutionTime / learningData.categories[category].count);
    }

    // Aprender sobre problemas comunes (del closeReason)
    if (closeReason) {
      const keywords = extractKeywords(closeReason);
      keywords.forEach(keyword => {
        if (!learningData.commonIssues[keyword]) {
          learningData.commonIssues[keyword] = {
            count: 0,
            categories: {},
            solutions: []
          };
        }
        learningData.commonIssues[keyword].count++;
        if (!learningData.commonIssues[keyword].categories[category]) {
          learningData.commonIssues[keyword].categories[category] = 0;
        }
        learningData.commonIssues[keyword].categories[category]++;
      });
    }

    // Aprender sobre tiempos de resolución
    if (resolutionTime !== null) {
      learningData.resolutionTimes.push(resolutionTime);
      // Mantener solo los últimos 1000 tiempos
      if (learningData.resolutionTimes.length > 1000) {
        learningData.resolutionTimes = learningData.resolutionTimes.slice(-1000);
      }
    }

    // Aprender sobre rendimiento del staff
    if (staffId) {
      if (!learningData.staffPerformance[staffId]) {
        learningData.staffPerformance[staffId] = {
          ticketsHandled: 0,
          totalRating: 0,
          ratingCount: 0,
          avgRating: 0,
          totalResolutionTime: 0,
          resolutionCount: 0,
          avgResolutionTime: 0
        };
      }

      learningData.staffPerformance[staffId].ticketsHandled++;
      
      if (ticket.staffRating) {
        learningData.staffPerformance[staffId].totalRating += ticket.staffRating;
        learningData.staffPerformance[staffId].ratingCount++;
        learningData.staffPerformance[staffId].avgRating = 
          Math.round((learningData.staffPerformance[staffId].totalRating / learningData.staffPerformance[staffId].ratingCount) * 10) / 10;
      }

      if (resolutionTime !== null) {
        learningData.staffPerformance[staffId].totalResolutionTime += resolutionTime;
        learningData.staffPerformance[staffId].resolutionCount++;
        learningData.staffPerformance[staffId].avgResolutionTime = 
          Math.round(learningData.staffPerformance[staffId].totalResolutionTime / learningData.staffPerformance[staffId].resolutionCount);
      }
    }

    // Aprender patrones (categoría + invoiceId = solución común)
    if (invoiceId && closeReason) {
      const patternKey = `${category}_${invoiceId ? 'with_invoice' : 'no_invoice'}`;
      if (!learningData.patterns[patternKey]) {
        learningData.patterns[patternKey] = {
          count: 0,
          commonSolutions: []
        };
      }
      learningData.patterns[patternKey].count++;
      
      // Guardar solución común si aparece varias veces
      const solutionKeywords = extractKeywords(closeReason).slice(0, 5).join('_');
      if (solutionKeywords) {
        const existingSolution = learningData.patterns[patternKey].commonSolutions.find(s => s.keywords === solutionKeywords);
        if (existingSolution) {
          existingSolution.count++;
        } else {
          learningData.patterns[patternKey].commonSolutions.push({
            keywords: solutionKeywords,
            solution: closeReason.substring(0, 200), // Primeros 200 caracteres
            count: 1
          });
        }
      }
    }

    saveLearningData();
    console.log(`[TICKET-LEARNING] ✅ Learned from ticket ${ticket.id} (category: ${category})`);
  } catch (error) {
    console.error('[TICKET-LEARNING] Error learning from ticket:', error);
  }
}

/**
 * Analizar todos los tickets cerrados y aprender de ellos
 */
export function analyzeAllTickets() {
  try {
    if (!existsSync(TICKETS_FILE)) {
      console.log('[TICKET-LEARNING] No tickets file found');
      return;
    }

    const ticketsData = JSON.parse(readFileSync(TICKETS_FILE, 'utf-8'));
    const closedTickets = Object.values(ticketsData.tickets || {}).filter(t => t.closed);

    console.log(`[TICKET-LEARNING] Analyzing ${closedTickets.length} closed tickets...`);

    let learnedCount = 0;
    closedTickets.forEach(ticket => {
      try {
        learnFromTicket(ticket);
        learnedCount++;
      } catch (error) {
        console.error(`[TICKET-LEARNING] Error analyzing ticket ${ticket.id}:`, error);
      }
    });

    console.log(`[TICKET-LEARNING] ✅ Analysis complete. Learned from ${learnedCount} tickets.`);
  } catch (error) {
    console.error('[TICKET-LEARNING] Error analyzing tickets:', error);
  }
}

/**
 * Obtener sugerencias basadas en la categoría del ticket
 */
export function getSuggestionsForCategory(category) {
  loadLearningData();
  
  const categoryData = learningData.categories[category];
  if (!categoryData) {
    return {
      avgResolutionTime: null,
      commonIssues: [],
      message: `No hay datos suficientes para la categoría "${category}"`
    };
  }

  // Obtener problemas comunes para esta categoría
  const commonIssues = Object.entries(learningData.commonIssues)
    .filter(([_, data]) => data.categories[category])
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([keyword, data]) => ({
      keyword,
      count: data.count,
      frequency: data.categories[category]
    }));

  return {
    avgResolutionTime: categoryData.avgResolutionTime,
    commonIssues,
    totalTickets: categoryData.count,
    message: `Basado en ${categoryData.count} tickets anteriores, el tiempo promedio de resolución es ${categoryData.avgResolutionTime} minutos.`
  };
}

/**
 * Obtener sugerencias basadas en palabras clave del problema
 */
export function getSuggestionsForIssue(issueText) {
  loadLearningData();
  
  if (!issueText) {
    return { suggestions: [], message: 'No se proporcionó texto del problema' };
  }

  const keywords = extractKeywords(issueText);
  const suggestions = [];

  keywords.forEach(keyword => {
    const issueData = learningData.commonIssues[keyword];
    if (issueData && issueData.count > 2) {
      // Encontrar la categoría más común para este problema
      const mostCommonCategory = Object.entries(issueData.categories)
        .sort((a, b) => b[1] - a[1])[0];

      if (mostCommonCategory) {
        suggestions.push({
          keyword,
          category: mostCommonCategory[0],
          frequency: mostCommonCategory[1],
          totalOccurrences: issueData.count
        });
      }
    }
  });

  return {
    suggestions: suggestions.sort((a, b) => b.frequency - a.frequency).slice(0, 5),
    message: suggestions.length > 0 
      ? `Se encontraron ${suggestions.length} problemas similares en tickets anteriores.`
      : 'No se encontraron problemas similares en tickets anteriores.'
  };
}

/**
 * Obtener estadísticas de rendimiento del staff
 */
export function getStaffStats(staffId) {
  loadLearningData();
  
  const staffData = learningData.staffPerformance[staffId];
  if (!staffData) {
    return {
      ticketsHandled: 0,
      avgRating: null,
      avgResolutionTime: null,
      message: 'No hay datos de rendimiento para este staff'
    };
  }

  return {
    ticketsHandled: staffData.ticketsHandled,
    avgRating: staffData.avgRating,
    avgResolutionTime: staffData.avgResolutionTime,
    message: `Este staff ha manejado ${staffData.ticketsHandled} tickets con una calificación promedio de ${staffData.avgRating}/5 y tiempo promedio de resolución de ${staffData.avgResolutionTime} minutos.`
  };
}

/**
 * Obtener estadísticas generales
 */
export function getGeneralStats() {
  loadLearningData();
  
  const totalCategories = Object.keys(learningData.categories).length;
  const totalIssues = Object.keys(learningData.commonIssues).length;
  const totalTickets = Object.values(learningData.categories).reduce((sum, cat) => sum + cat.count, 0);
  const avgResolutionTime = learningData.resolutionTimes.length > 0
    ? Math.round(learningData.resolutionTimes.reduce((a, b) => a + b, 0) / learningData.resolutionTimes.length)
    : null;
  const totalStaff = Object.keys(learningData.staffPerformance).length;

  return {
    totalTickets,
    totalCategories,
    totalIssues,
    avgResolutionTime,
    totalStaff,
    lastUpdated: learningData.lastUpdated
  };
}

// Cargar datos al iniciar
loadLearningData();

