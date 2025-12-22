import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';

interface EstadisticasDia {
  ventasHoy: number;
  totalRecaudado: number;
  productosVendidos: number;
  ventaPromedio: number;
  ventasFiadasHoy: number;
  montoFiadoHoy: number;
}

interface Reporte {
  id: string;
  tipo: 'stock' | 'vencimiento' | 'sistema' | 'finanzas' | 'clientes';
  titulo: string;
  mensaje: string;
  prioridad: 'alta' | 'media' | 'baja';
  leido: boolean;
  fecha: Date;
  icono: string;
  accion?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  // MEJORA DE PERFORMANCE CRÍTICA: OnPush evita que Angular verifique el HTML constantemente
  changeDetection: ChangeDetectionStrategy.OnPush, 
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class DashboardComponent implements OnInit {
  estadisticas: EstadisticasDia = {
    ventasHoy: 0, totalRecaudado: 0, productosVendidos: 0, ventaPromedio: 0,
    ventasFiadasHoy: 0, montoFiadoHoy: 0
  };

  reportes: Reporte[] = [];
  mostrarReportes = false;
  cargando = true;

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarReportesLocales();
    this.cargarDatosDashboard();
  }

  cargarReportesLocales() {
    const guardados = localStorage.getItem('reportes');
    if (guardados) {
      try {
        this.reportes = JSON.parse(guardados).map((r: any) => ({
          ...r,
          fecha: new Date(r.fecha)
        }));
      } catch (e) { console.error('Error parsing reportes', e); }
    }
  }

  async cargarDatosDashboard() {
    this.cargando = true;
    this.cdr.markForCheck(); // Avisar a la vista que actualice el estado de carga
    
    try {
      // Ejecución en paralelo para mejorar velocidad de carga
      await Promise.all([
        this.procesarVentasHoy(),
        this.procesarStockCritico(), // Aquí está la lógica nueva
        this.procesarFinanzasYClientes()
      ]);
      
      this.guardarReportes();
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      this.cargando = false;
      this.cdr.markForCheck(); // Forzar actualización de vista al terminar
    }
  }

  // --- LÓGICA DE STOCK DETALLADA ---
  async procesarStockCritico() {
    // Solicitamos solo las columnas necesarias para mejorar la transferencia de datos
    const { data: productos, error } = await this.supabase.getClient()
      .from('productos')
      .select('nombre, cantidad_stock')
      .eq('activo', true)
      .lt('cantidad_stock', 5); // Traemos todo lo menor a 5 de una vez

    if (error || !productos) return;

    const agotados = productos.filter(p => p.cantidad_stock === 0);
    const stockBajo = productos.filter(p => p.cantidad_stock > 0);

    // 1. Reporte de Agotados con Nombres
    if (agotados.length > 0) {
      const listaNombres = this.formatearListaNombres(agotados.map(p => p.nombre));
      
      this.agregarReporteUnico({
        tipo: 'stock',
        titulo: `${agotados.length} Productos Agotados`,
        // Mensaje dinámico: "Faltan: Coca Cola, Pan y 2 más."
        mensaje: `Se agotó el stock de: ${listaNombres}. Reponer urgentemente.`,
        prioridad: 'alta',
        icono: 'fa-times-circle',
        accion: '/stock'
      });
    }

    // 2. Reporte de Stock Bajo con Nombres
    if (stockBajo.length > 0) {
      const listaNombres = this.formatearListaNombres(stockBajo.map(p => p.nombre));

      this.agregarReporteUnico({
        tipo: 'stock',
        titulo: `${stockBajo.length} Productos por agotarse`,
        mensaje: `Quedan menos de 5 unidades de: ${listaNombres}.`,
        prioridad: 'media',
        icono: 'fa-exclamation-triangle',
        accion: '/stock'
      });
    }
  }

  // Helper para crear strings como "Prod A, Prod B y 3 más"
  private formatearListaNombres(nombres: string[]): string {
    const MAX_VISIBLE = 3; // Cuántos nombres mostrar antes de resumir
    if (nombres.length <= MAX_VISIBLE) {
      return nombres.join(', ');
    } else {
      const visibles = nombres.slice(0, MAX_VISIBLE).join(', ');
      const restantes = nombres.length - MAX_VISIBLE;
      return `${visibles} y ${restantes} más`;
    }
  }

  async procesarVentasHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // 1. Traemos las ventas de hoy. IMPORTANTE: Agregamos 'id' al select
    const { data: ventas } = await this.supabase.getClient()
      .from('ventas')
      .select('id, total_final, metodo_pago') 
      .gte('fecha_venta', hoy.toISOString());

    if (!ventas) return;

    // Cálculos financieros existentes
    const ventasFiadas = ventas.filter(v => v.metodo_pago === 'fiado');
    const ventasReales = ventas.filter(v => v.metodo_pago !== 'fiado');

    this.estadisticas.ventasHoy = ventas.length;
    this.estadisticas.ventasFiadasHoy = ventasFiadas.length;
    this.estadisticas.montoFiadoHoy = ventasFiadas.reduce((sum, v) => sum + Number(v.total_final), 0);
    this.estadisticas.totalRecaudado = ventasReales.reduce((sum, v) => sum + Number(v.total_final), 0);
    this.estadisticas.ventaPromedio = ventasReales.length > 0 
      ? this.estadisticas.totalRecaudado / ventasReales.length 
      : 0;

    // --- CORRECCIÓN: Lógica para contar unidades vendidas ---
    if (ventas.length > 0) {
        try {
            // Obtenemos los IDs de las ventas de hoy
            const ventaIds = ventas.map(v => v.id);

            // Consultamos detalle_venta filtrando por esos IDs
            const { data: detalles, error } = await this.supabase.getClient()
                .from('detalle_venta')
                .select('cantidad')
                .in('venta_id', ventaIds);

            if (!error && detalles) {
                // Sumamos la columna cantidad de todos los registros encontrados
                this.estadisticas.productosVendidos = detalles.reduce((acc, item: any) => acc + (item.cantidad || 0), 0);
            }
        } catch (err) {
            console.error('Error calculando productos vendidos:', err);
        }
    } else {
        this.estadisticas.productosVendidos = 0;
    }

    // Actualizamos la vista manualmente (necesario por OnPush)
    this.cdr.markForCheck();
  }
  
  async procesarFinanzasYClientes() {
      // Aquí iría tu lógica de deuda alta, similar a la de stock
      // Ejemplo: traer clientes con deuda > X y listarlos
  }

  agregarReporteUnico(reporte: Omit<Reporte, 'id' | 'leido' | 'fecha'>) {
    // Buscamos si ya existe un reporte de este tipo hoy
    const index = this.reportes.findIndex(r => 
        r.tipo === reporte.tipo && 
        r.titulo === reporte.titulo &&
        new Date(r.fecha).toDateString() === new Date().toDateString()
    );

    if (index !== -1) {
        // CORRECCIÓN: Solo actualizamos si el contenido (mensaje) cambió.
        // Si el mensaje es igual (los mismos productos), NO hacemos nada para respetar el 'leido: true'.
        if (this.reportes[index].mensaje !== reporte.mensaje) {
            this.reportes[index].mensaje = reporte.mensaje;
            this.reportes[index].leido = false; // Solo desmarcamos si hay información nueva
            this.reportes[index].fecha = new Date();
            
            // Lo movemos al principio de la lista
            const item = this.reportes.splice(index, 1)[0];
            this.reportes.unshift(item);
            this.guardarReportes();
        }
    } else {
        // Es un reporte totalmente nuevo
        this.reportes.unshift({
            ...reporte,
            id: Math.random().toString(36).substring(2, 9),
            leido: false,
            fecha: new Date(),
            icono: reporte.icono || 'fa-info-circle'
        });
        this.guardarReportes();
    }
  }

  // Helpers UI
  get reportesNoLeidos(): number {
    return this.reportes.filter(r => !r.leido).length;
  }

  toggleReportes() { this.mostrarReportes = !this.mostrarReportes; }
  
  marcarTodosComoLeidos() { 
    this.reportes.forEach(r => r.leido = true); 
    this.guardarReportes(); 
  }
  
  marcarComoLeido(r: Reporte) { 
    r.leido = true; 
    this.guardarReportes(); 
  }
  
  eliminarReporte(r: Reporte) { 
    this.reportes = this.reportes.filter(x => x.id !== r.id); 
    this.guardarReportes(); 
  }

  private guardarReportes() {
    localStorage.setItem('reportes', JSON.stringify(this.reportes));
    this.cdr.markForCheck(); // Importante con OnPush
  }

  // Funciones para el HTML (necesarias porque mantienes el HTML original)
  getPrioridadColor(prioridad: string): string {
    switch(prioridad) {
      case 'alta': return 'text-red-500';
      case 'media': return 'text-yellow-500';
      case 'baja': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  getPrioridadBg(prioridad: string): string {
    const isDark = this.themeService.isDark(); // Asegúrate que tu servicio tenga este método o prop
    switch(prioridad) {
      case 'alta': return isDark ? 'bg-red-900/20' : 'bg-red-50';
      case 'media': return isDark ? 'bg-yellow-900/20' : 'bg-yellow-50';
      case 'baja': return isDark ? 'bg-blue-900/20' : 'bg-blue-50';
      default: return isDark ? 'bg-gray-800' : 'bg-gray-50';
    }
  }
}