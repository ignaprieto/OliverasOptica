import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Cliente {
  id?: string;
  nombre: string;
  email?: string;
  telefono?: string;
  dni?: string;
  direccion?: string;
  segundo_contacto?: string;
  limite_credito: number;
  saldo_actual: number;
  activo: boolean;
  cuit?: string; 
  condicion_iva?: string;
  observaciones?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VentaCredito {
  id: string;
  venta_id: string;
  cliente_id: string;
  monto_total: number;
  saldo_pendiente: number;
  estado: 'pendiente' | 'pagado_parcial' | 'pagado_total';
  fecha_venta: string;
  fecha_vencimiento?: string;
  observaciones?: string;
  // Estructura anidada de Supabase
  ventas?: {
    id: string;
    detalle_venta: {
      cantidad: number;
      precio_unitario: number;
      subtotal: number;
      talle?: string;
      productos?: {
        nombre: string;
        marca: string;
        codigo: string;
      };
    }[];
  };
}

export interface PagoCliente {
  id?: string;
  cliente_id: string;
  venta_credito_id: string;
  monto_pagado: number;
  metodo_pago: 'efectivo' | 'transferencia' | 'mercado_pago' | 'tarjeta_debito' | 'tarjeta_credito';
  comprobante?: string;
  fecha_pago?: string;
  usuario_nombre?: string;
  usuario_id?: string;
  observaciones?: string;
}

export interface ResumenCliente {
  total_compras: number;
  total_pagado: number;
  total_pendiente: number;
  cantidad_ventas: number;
}

export interface ResultadoVentaCredito {
  success: boolean;
  error?: string;
  message?: string;
  nuevo_saldo?: number;
  limite_credito?: number;
  saldo_actual?: number;
}

// Interfaz para filtros
interface FiltrosCliente {
  activo?: boolean;
  busqueda?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientesService {
  // Propiedad pública para acceso directo si es necesario (patrón usado en otros componentes)
  // Aunque lo ideal es encapsular, mantenemos compatibilidad.
  public get supabase() {
    return this.supabaseService;
  }

  constructor(private supabaseService: SupabaseService) {}

  // ========== CRUD de Clientes ==========

  async obtenerClientes(filtros?: FiltrosCliente): Promise<Cliente[]> {
    let query = this.supabaseService.getClient()
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false });

    if (filtros?.activo !== undefined) {
      query = query.eq('activo', filtros.activo);
    }

    if (filtros?.busqueda) {
      const busq = `%${filtros.busqueda}%`;
      query = query.or(`nombre.ilike.${busq},dni.ilike.${busq},email.ilike.${busq},telefono.ilike.${busq}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as Cliente[]) || [];
  }

  async obtenerClientePorId(id: string): Promise<Cliente> {
    const { data, error } = await this.supabaseService.getClient()
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Cliente;
  }

  async crearCliente(cliente: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>): Promise<Cliente> {
    const { data, error } = await this.supabaseService.getClient()
      .from('clientes')
      .insert([cliente])
      .select()
      .single();
    
    if (error) throw error;
    return data as Cliente;
  }

  async actualizarCliente(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
    const { data, error } = await this.supabaseService.getClient()
      .from('clientes')
      .update({ ...cliente, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data as Cliente;
  }

  async desactivarCliente(id: string): Promise<Cliente> {
    return this.actualizarCliente(id, { activo: false });
  }

  async activarCliente(id: string): Promise<Cliente> {
    return this.actualizarCliente(id, { activo: true });
  }

  // ========== Ventas a Crédito ==========

  async crearVentaCredito(params: {
    venta_id: string;
    cliente_id: string;
    monto_total: number;
    fecha_vencimiento?: string;
    observaciones?: string;
  }): Promise<ResultadoVentaCredito> {
    const { data, error } = await this.supabaseService.getClient()
      .rpc('crear_venta_credito', {
        p_venta_id: params.venta_id,
        p_cliente_id: params.cliente_id,
        p_monto_total: params.monto_total,
        p_fecha_vencimiento: params.fecha_vencimiento || null,
        p_observaciones: params.observaciones || null
      });
    
    if (error) throw error;
    return data as ResultadoVentaCredito;
  }

  async obtenerVentasCredito(clienteId: string): Promise<VentaCredito[]> {
  const { data, error } = await this.supabaseService.getClient()
    .from('ventas_credito')
    .select(`
      id,
      venta_id,
      cliente_id,
      monto_total,
      saldo_pendiente,
      estado,
      fecha_venta,
      fecha_vencimiento,
      observaciones,
      ventas!inner (
        id,
        detalle_venta (
          cantidad,
          precio_unitario,
          subtotal,
          talle,
          productos (
            nombre,
            marca,
            codigo
          )
        )
      )
    `)
    .eq('cliente_id', clienteId)
    .order('fecha_venta', { ascending: false });
  
  if (error) {
    console.error('Error al cargar ventas crédito:', error);
    throw error;
  }
  
  return (data as unknown as VentaCredito[]) || [];
}

  async obtenerVentaCreditoPorId(id: string): Promise<VentaCredito> {
    const { data, error } = await this.supabaseService.getClient()
      .from('ventas_credito')
      .select(`
        *,
        ventas (
          detalle_venta (
            cantidad,
            precio_unitario,
            subtotal,
            talle,
            productos (
              nombre,
              marca,
              codigo
            )
          )
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as unknown as VentaCredito;
  }

  // ========== Pagos ==========

  async registrarPago(pago: Omit<PagoCliente, 'id' | 'fecha_pago'>): Promise<PagoCliente> {
    // Usamos el nuevo método optimizado del servicio Supabase
    const user = await this.supabaseService.getCurrentAppUser();
    const userName = user ? user.nombre : 'Usuario';
    const userId = user ? user.id : undefined;
    
    const { data, error } = await this.supabaseService.getClient()
      .from('pagos_cliente')
      .insert([{
        ...pago,
        usuario_nombre: userName,
        usuario_id: userId
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data as PagoCliente;
  }

  async obtenerPagosCliente(clienteId: string): Promise<PagoCliente[]> {
    const { data, error } = await this.supabaseService.getClient()
      .from('pagos_cliente')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha_pago', { ascending: false });
    
    if (error) throw error;
    return data as PagoCliente[];
  }

  async obtenerPagosVenta(ventaCreditoId: string): Promise<PagoCliente[]> {
    const { data, error } = await this.supabaseService.getClient()
      .from('pagos_cliente')
      .select('*')
      .eq('venta_credito_id', ventaCreditoId)
      .order('fecha_pago', { ascending: false });
    
    if (error) throw error;
    return data as PagoCliente[];
  }

  // ========== Resúmenes y Estadísticas ==========

  async obtenerResumenCliente(clienteId: string): Promise<ResumenCliente> {
    const { data, error } = await this.supabaseService.getClient()
      .rpc('obtener_resumen_cliente', {
        p_cliente_id: clienteId
      });
    
    if (error) throw error;
    return data as ResumenCliente;
  }

  async obtenerClientesConDeuda(): Promise<Cliente[]> {
    const { data, error } = await this.supabaseService.getClient()
      .from('clientes')
      .select('*')
      .gt('saldo_actual', 0)
      .eq('activo', true)
      .order('saldo_actual', { ascending: false });
    
    if (error) throw error;
    return data as Cliente[];
  }

  async obtenerClientesPorVencer(dias: number = 7): Promise<VentaCredito[]> {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + dias);
    
    const { data, error } = await this.supabaseService.getClient()
      .from('ventas_credito')
      .select(`
        *,
        clientes (*)
      `)
      .neq('estado', 'pagado_total')
      .lte('fecha_vencimiento', fechaLimite.toISOString().split('T')[0])
      .order('fecha_vencimiento', { ascending: true });
    
    if (error) throw error;
    return data as unknown as VentaCredito[];
  }

  // ========== Validaciones ==========

  async validarLimiteCredito(clienteId: string, montoNuevo: number): Promise<{
    valido: boolean;
    mensaje?: string;
    limite_credito?: number;
    saldo_actual?: number;
    disponible?: number;
  }> {
    const cliente = await this.obtenerClientePorId(clienteId);
    
    if (!cliente.activo) {
      return {
        valido: false,
        mensaje: 'El cliente está inactivo'
      };
    }
    
    const nuevoSaldo = cliente.saldo_actual + montoNuevo;
    const disponible = cliente.limite_credito - cliente.saldo_actual;
    
    if (nuevoSaldo > cliente.limite_credito) {
      return {
        valido: false,
        mensaje: `Se excede el límite de crédito. Disponible: $${disponible.toFixed(2)}`,
        limite_credito: cliente.limite_credito,
        saldo_actual: cliente.saldo_actual,
        disponible
      };
    }
    
    return {
      valido: true,
      limite_credito: cliente.limite_credito,
      saldo_actual: cliente.saldo_actual,
      disponible
    };
  }

  async verificarDniUnico(dni: string, clienteId?: string): Promise<boolean> {
    let query = this.supabaseService.getClient()
      .from('clientes')
      .select('id')
      .eq('dni', dni);
    
    if (clienteId) {
      query = query.neq('id', clienteId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    return (data?.length || 0) === 0;
  }
}