import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { PermisosService } from '../../services/permisos.service';

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
  private permisosService = inject(PermisosService);
  public supabase = inject(SupabaseService);
  public themeService = inject(ThemeService);

  // Columnas específicas para consultas optimizadas
  private readonly COLUMNAS_PRODUCTOS = 'nombre, cantidad_stock';
  private readonly COLUMNAS_VENTAS = 'id, total_final, metodo_pago';
  private readonly COLUMNAS_DETALLE = 'cantidad';

  // Signals para estado del componente
  estadisticas = signal<EstadisticasDia>({
    ventasHoy: 0,
    totalRecaudado: 0,
    productosVendidos: 0,
    ventaPromedio: 0,
    ventasFiadasHoy: 0,
    montoFiadoHoy: 0
  });

  reportes = signal<Reporte[]>([]);
  mostrarReportes = signal(false);
  cargando = signal(true);
  
  // Paginación para reportes (si se implementa scroll infinito)
  private readonly REPORTES_POR_PAGINA = 10;
  reportesPagina = signal(0);
  cargandoMasReportes = signal(false);
  todosReportesLoaded = signal(false);

  // Menú de navegación
  readonly menuItems = [
    { vista: 'stock', titulo: 'Stock', desc: 'Agrega productos y actualiza el stock disponible.', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: 'text-indigo-500', bgIcon: 'bg-indigo-500', route: '/stock' },
    { vista: 'ventas', titulo: 'Ventas', desc: 'Gestión y registro de ventas.', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', color: 'text-green-500', bgIcon: 'bg-green-500', route: '/ventas' },
    { vista: 'historial', titulo: 'Historial', desc: 'Consulta historial de ventas y movimientos.', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-rose-500', bgIcon: 'bg-rose-500', route: '/historial' },
    { vista: 'productos', titulo: 'Productos', desc: 'Ver productos disponibles.', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', color: 'text-yellow-500', bgIcon: 'bg-yellow-500', route: '/productos' },
    { vista: 'aumento', titulo: 'Aumento', desc: 'Aplica aumentos por categoría o individual.', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'text-orange-500', bgIcon: 'bg-orange-500', route: '/aumento' },
    { vista: 'descuentos', titulo: 'Descuentos', desc: 'Gestiona descuentos en productos.', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', color: 'text-teal-500', bgIcon: 'bg-teal-500', route: '/descuentos' },
    { vista: 'finanzas', titulo: 'Finanzas', desc: 'Gestión de gastos y finanzas.', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-green-700', bgIcon: 'bg-green-700', route: '/finanzas' },
    { vista: 'empleados', titulo: 'Empleados', desc: 'Gestión de empleados.', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', color: 'text-blue-700', bgIcon: 'bg-blue-700', route: '/empleados' },
    { vista: 'configuracion', titulo: 'Configuración', desc: 'Configura opciones del sistema.', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', color: 'text-gray-500', bgIcon: 'bg-gray-500', route: '/configuracion' },
    { vista: 'caja', titulo: 'Caja', desc: 'Controla y gestiona la caja de tu negocio.', icon: 'M12 6v6h4.5m4.5 0A9 9 0 1112 3a9 9 0 019 9z', color: 'text-green-400', bgIcon: 'bg-green-400', route: '/caja' },
    { vista: 'clientes', titulo: 'Clientes', desc: 'Agrega clientes y realiza vista de sus movimientos.', icon: 'M15 19.128a9.38 9.38 0 003.6.372A4.125 4.125 0 0018 15.75c0-1.245-.576-2.354-1.47-3.075M15 19.128a9.337 9.337 0 01-3 .497 9.337 9.337 0 01-3-.497M15 19.128V18a4.125 4.125 0 00-4.125-4.125H9.75m0 0A4.125 4.125 0 015.625 9.75 4.125 4.125 0 019.75 5.625a4.125 4.125 0 014.125 4.125v.128M9.75 13.875H8.25A4.125 4.125 0 004.125 18v1.128', color: 'text-blue-400', bgIcon: 'bg-blue-400', route: '/clientes' },
    { vista: 'deposito', titulo: 'Depósito', desc: 'Carga y controla stock en tu depósito.', icon: 'M20.25 7.5l-8.954-4.477a.75.75 0 00-.684 0L2.25 7.5m18 0l-9 4.5m9-4.5v9.75a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V7.5m9 4.5v9.75', color: 'text-orange-300', bgIcon: 'bg-orange-300', route: '/deposito' }
  ];

  // Computed para menú filtrado
  menuFiltrado = computed(() => {
    return this.menuItems.filter(item => 
      this.permisosService.puede(item.vista, 'ver')
    );
  });

  // Computed para reportes no leídos
  reportesNoLeidos = computed(() => {
    return this.reportes().filter(r => !r.leido).length;
  });

  ngOnInit() {
    this.permisosService.cargarPermisos();
    this.cargarReportesLocales();
    this.cargarDatosDashboard();
  }

  cargarReportesLocales() {
    const guardados = localStorage.getItem('reportes');
    if (guardados) {
      try {
        const parsed = JSON.parse(guardados).map((r: any) => ({
          ...r,
          fecha: new Date(r.fecha)
        }));
        this.reportes.set(parsed);
      } catch (e) {
        console.error('Error parsing reportes', e);
      }
    }
  }

  async cargarDatosDashboard() {
    this.cargando.set(true);
    
    try {
      await Promise.all([
        this.procesarVentasHoy(),
        this.procesarStockCritico(), 
        this.procesarFinanzasYClientes()
      ]);
      
      this.guardarReportes();
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      this.cargando.set(false);
    }
  }

  async procesarStockCritico() {
    const { data: productos, error } = await this.supabase.getClient()
      .from('productos')
      .select(this.COLUMNAS_PRODUCTOS)
      .eq('activo', true)
      .lt('cantidad_stock', 5);

    if (error || !productos) return;

    const agotados = productos.filter(p => p.cantidad_stock === 0);
    const stockBajo = productos.filter(p => p.cantidad_stock > 0);

    if (agotados.length > 0) {
      const listaNombres = this.formatearListaNombres(agotados.map(p => p.nombre));
      
      this.agregarReporteUnico({
        tipo: 'stock',
        titulo: `${agotados.length} Productos Agotados`,
        mensaje: `Se agotó el stock de: ${listaNombres}. Reponer urgentemente.`,
        prioridad: 'alta',
        icono: 'fa-times-circle',
        accion: '/stock'
      });
    }

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

  private formatearListaNombres(nombres: string[]): string {
    const MAX_VISIBLE = 3; 
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

    const { data: ventas } = await this.supabase.getClient()
      .from('ventas')
      .select(this.COLUMNAS_VENTAS)
      .gte('fecha_venta', hoy.toISOString());

    if (!ventas) return;

    const ventasFiadas = ventas.filter(v => v.metodo_pago === 'fiado');
    const ventasReales = ventas.filter(v => v.metodo_pago !== 'fiado');

    const totalRecaudado = ventasReales.reduce((sum, v) => sum + Number(v.total_final), 0);
    const ventaPromedio = ventasReales.length > 0 ? totalRecaudado / ventasReales.length : 0;

    // Calcular productos vendidos
    let productosVendidos = 0;
    if (ventas.length > 0) {
      try {
        const ventaIds = ventas.map(v => v.id);
        const { data: detalles, error } = await this.supabase.getClient()
          .from('detalle_venta')
          .select(this.COLUMNAS_DETALLE)
          .in('venta_id', ventaIds);

        if (!error && detalles) {
          productosVendidos = detalles.reduce((acc, item: any) => acc + (item.cantidad || 0), 0);
        }
      } catch (err) {
        console.error('Error calculando productos vendidos:', err);
      }
    }

    // Actualizar estadísticas usando signal
    this.estadisticas.set({
      ventasHoy: ventas.length,
      ventasFiadasHoy: ventasFiadas.length,
      montoFiadoHoy: ventasFiadas.reduce((sum, v) => sum + Number(v.total_final), 0),
      totalRecaudado,
      ventaPromedio,
      productosVendidos
    });
  }
  
  async procesarFinanzasYClientes() {
    // Lógica de finanzas y clientes pendiente de implementar
  }

  agregarReporteUnico(reporte: Omit<Reporte, 'id' | 'leido' | 'fecha'>) {
    this.reportes.update(reportesActuales => {
      const index = reportesActuales.findIndex(r => 
        r.tipo === reporte.tipo && 
        r.titulo === reporte.titulo &&
        new Date(r.fecha).toDateString() === new Date().toDateString()
      );

      if (index !== -1) {
        if (reportesActuales[index].mensaje !== reporte.mensaje) {
          const nuevoReporte = {
            ...reportesActuales[index],
            mensaje: reporte.mensaje,
            leido: false,
            fecha: new Date()
          };
          
          const nuevosReportes = [...reportesActuales];
          nuevosReportes.splice(index, 1);
          return [nuevoReporte, ...nuevosReportes];
        }
        return reportesActuales;
      } else {
        const nuevoReporte: Reporte = {
          ...reporte,
          id: Math.random().toString(36).substring(2, 9),
          leido: false,
          fecha: new Date(),
          icono: reporte.icono || 'fa-info-circle'
        };
        return [nuevoReporte, ...reportesActuales];
      }
    });
    
    this.guardarReportes();
  }

  toggleReportes() {
    this.mostrarReportes.update(v => !v);
  }
  
  marcarTodosComoLeidos() {
    this.reportes.update(reportes => 
      reportes.map(r => ({ ...r, leido: true }))
    );
    this.guardarReportes();
  }
  
  marcarComoLeido(reporte: Reporte) {
    this.reportes.update(reportes =>
      reportes.map(r => r.id === reporte.id ? { ...r, leido: true } : r)
    );
    this.guardarReportes();
  }
  
  eliminarReporte(reporte: Reporte) {
    this.reportes.update(reportes =>
      reportes.filter(r => r.id !== reporte.id)
    );
    this.guardarReportes();
  }

  private guardarReportes() {
    localStorage.setItem('reportes', JSON.stringify(this.reportes()));
  }

  getPrioridadColor(prioridad: string): string {
    switch(prioridad) {
      case 'alta': return 'text-red-500';
      case 'media': return 'text-yellow-500';
      case 'baja': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  getPrioridadBg(prioridad: string): string {
    const isDark = this.themeService.isDark();
    switch(prioridad) {
      case 'alta': return isDark ? 'bg-red-900/20' : 'bg-red-50';
      case 'media': return isDark ? 'bg-yellow-900/20' : 'bg-yellow-50';
      case 'baja': return isDark ? 'bg-blue-900/20' : 'bg-blue-50';
      default: return isDark ? 'bg-gray-800' : 'bg-gray-50';
    }
  }

  // TrackBy para optimizar renderizado
  trackByReporteId(index: number, reporte: Reporte): string {
    return reporte.id;
  }

  trackByMenuItem(index: number, item: any): string {
    return item.vista;
  }
}