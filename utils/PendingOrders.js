import { readFileSync, writeFileSync, existsSync } from 'fs';

const PENDING_ORDERS_FILE = './pendingOrders.json';

let pendingOrdersData = { orders: {}, nextId: 1 };

// Cargar datos de órdenes pendientes
function loadPendingOrders() {
  try {
    if (existsSync(PENDING_ORDERS_FILE)) {
      const data = readFileSync(PENDING_ORDERS_FILE, 'utf-8');
      pendingOrdersData = JSON.parse(data);
    }
  } catch (error) {
    console.error('[PENDING ORDERS] Error loading:', error);
    pendingOrdersData = { orders: {}, nextId: 1 };
  }
}

// Guardar datos de órdenes pendientes
function savePendingOrders() {
  try {
    writeFileSync(PENDING_ORDERS_FILE, JSON.stringify(pendingOrdersData, null, 2), 'utf-8');
  } catch (error) {
    console.error('[PENDING ORDERS] Error saving:', error);
  }
}

// Inicializar
loadPendingOrders();

export class PendingOrders {
  /**
   * Crear una orden pendiente
   */
  static createPendingOrder(userId, userName, productId, productName, variantId, variantName, quantity, interactionId) {
    const orderId = `ORD-${String(pendingOrdersData.nextId).padStart(4, '0')}`;
    
    pendingOrdersData.orders[orderId] = {
      id: orderId,
      userId,
      userName,
      productId,
      productName,
      variantId,
      variantName,
      quantity,
      interactionId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      confirmedBy: null,
      confirmedAt: null
    };
    
    pendingOrdersData.nextId++;
    savePendingOrders();
    
    return orderId;
  }

  /**
   * Obtener orden pendiente por ID
   */
  static getPendingOrder(orderId) {
    return pendingOrdersData.orders[orderId];
  }

  /**
   * Confirmar una orden pendiente
   */
  static confirmOrder(orderId, confirmedByUserId, confirmedByUserName) {
    const order = pendingOrdersData.orders[orderId];
    if (!order) {
      return { success: false, message: 'Orden no encontrada' };
    }

    if (order.status !== 'pending') {
      return { success: false, message: 'Esta orden ya fue procesada' };
    }

    order.status = 'confirmed';
    order.confirmedBy = confirmedByUserId;
    order.confirmedByUserName = confirmedByUserName;
    order.confirmedAt = new Date().toISOString();
    savePendingOrders();

    return { success: true, order };
  }

  /**
   * Rechazar una orden pendiente
   */
  static rejectOrder(orderId) {
    const order = pendingOrdersData.orders[orderId];
    if (!order) {
      return { success: false, message: 'Orden no encontrada' };
    }

    if (order.status !== 'pending') {
      return { success: false, message: 'Esta orden ya fue procesada' };
    }

    order.status = 'rejected';
    savePendingOrders();

    return { success: true };
  }

  /**
   * Obtener todas las órdenes pendientes
   */
  static getAllPendingOrders() {
    return Object.values(pendingOrdersData.orders).filter(o => o.status === 'pending');
  }

  /**
   * Eliminar orden (después de procesarla)
   */
  static deleteOrder(orderId) {
    if (pendingOrdersData.orders[orderId]) {
      delete pendingOrdersData.orders[orderId];
      savePendingOrders();
      return true;
    }
    return false;
  }
}

