import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { PermisoDirective } from '../../directives/permiso.directive';

// Tipos
export interface ConfigRecibo {
  id?: string;
  nombre_negocio: string;
  direccion: string;
  ciudad: string;
  telefono1: string;
  telefono2: string;
  whatsapp1: string;
  whatsapp2: string;
  email_empresa: string | null;
  logo_url: string | null;
  mensaje_agradecimiento: string;
  mensaje_pie: string;
  email_desarrollador: string;
  updated_at?: string;
}

export interface FacturacionConfig {
  id?: string;
  razon_social: string;
  cuit: string;
  condicion_iva: 'Monotributista' | 'Responsable Inscripto';
  ingresos_brutos: string;
  inicio_actividades: string;
  punto_venta: number;
  facturacion_habilitada: boolean;
  reglas_facturacion?: { [key: string]: boolean };
}

export interface AfipConfig {
  cuit: string;
  puntoVenta: string;
  certificado: string;
  clavePrivada: string;
  ambiente: 'produccion' | 'homologacion';
}

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PermisoDirective],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfiguracionComponent implements OnInit, OnDestroy {
  // Inyecciones
  private supabase = inject(SupabaseService);
  public themeService = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);

  // MIGRACIÓN A SIGNALS
  activeTab = signal<'apariencia' | 'facturacion' | 'recibo' | 'contacto'>('apariencia');
  isLoading = signal(true);
  currentTheme = signal<'light' | 'dark'>('light');
  
facturacion = signal<FacturacionConfig>({
    razon_social: '',
    cuit: '',
    condicion_iva: 'Monotributista',
    ingresos_brutos: '',
    inicio_actividades: '',
    punto_venta: 1,
    facturacion_habilitada: false
  });

  // Configuración AFIP
  afipConfig = signal<AfipConfig>({
    cuit: '',
    puntoVenta: '',
    certificado: '',
    clavePrivada: '',
    ambiente: 'homologacion'
  });

  // Configuración Recibo
  configRecibo = signal<ConfigRecibo>({
    nombre_negocio: 'PRISYS SOLUTIONS',
    direccion: '9 DE JULIO 1718',
    ciudad: 'Corrientes - Capital (3400)',
    telefono1: '(3735) 475716',
    telefono2: '(3735) 410299',
    whatsapp1: '3735 475716',
    whatsapp2: '3735 410299',
    email_empresa: null,
    logo_url: null,
    mensaje_agradecimiento: '¡Gracias por su compra!',
    mensaje_pie: 'DESARROLLADO POR PRISYS SOLUTIONS',
    email_desarrollador: 'prisys.solutions@gmail.com'
  });

  // UI Logo
  archivoLogo = signal<File | null>(null);
  previsualizacionLogo = signal<string | null>(null);
  isSubiendoLogo = signal(false);
  isGuardando = signal(false);

  // Contacto (Readonly)
  readonly contactInfo = {
    email: 'prisys.solutions@gmail.com',
    telefono: '+54 3735475716',
    horario: 'Lunes a Viernes de 9:00 a 18:00'
  };

  // Toast
isToastVisible = signal(false);
mensajeToast = signal('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');
private toastTimeout: ReturnType<typeof setTimeout> | null = null;
private themeInterval: ReturnType<typeof setInterval> | null = null;

  private readonly COLUMNAS_RECIBO = 'id, nombre_negocio, direccion, ciudad, telefono1, telefono2, whatsapp1, whatsapp2, email_empresa, logo_url, mensaje_agradecimiento, mensaje_pie, email_desarrollador, updated_at';

  async ngOnInit(): Promise<void> {
    // Sincronizar tema inicial
    this.currentTheme.set(this.themeService.getCurrentTheme());
    
    // Chequeo periódico del tema (si no es reactivo)
    this.themeInterval = setInterval(() => {
      const t = this.themeService.getCurrentTheme();
      if (this.currentTheme() !== t) {
        this.currentTheme.set(t);
        this.cdr.markForCheck();
      }
    }, 1000);

    try {
      this.isLoading.set(true);
      
      // Carga paralela
      await Promise.all([
        this.loadAfipConfig(),
        this.cargarConfigRecibo(),
        this.cargarDatosFacturacion()
      ]);

    } catch (error) {
      console.error('Error carga inicial:', error);
      this.mostrarToast('Error de conexión', 'error');
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this.themeInterval) clearInterval(this.themeInterval);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  // --- MÉTODOS VISUALES ---
  
  get theme() { return this.currentTheme(); }

  setActiveTab(tab: 'apariencia' | 'facturacion' | 'recibo' | 'contacto'): void { 
    this.activeTab.set(tab);
  }

  changeTheme(theme: 'light' | 'dark'): void { 
    this.themeService.setTheme(theme);
    this.currentTheme.set(theme);
  }

  // TRACKBY FUNCTION para rendimiento en listas
  trackById(index: number, item: any): any {
    return item?.id ?? index;
  }

  // --- LÓGICA DE DATOS ---

  async loadAfipConfig(): Promise<void> {
    // Simulación rápida
    return Promise.resolve();
  }

  saveAfipConfig(): void {
    this.mostrarToast('Configuración AFIP guardada', 'success');
  }

  async cargarConfigRecibo(): Promise<void> {
    try {
      const client = this.supabase.getClient();
      
      // Selección explícita de columnas
      const { data, error } = await client
        .from('configuracion_recibo')
        .select(this.COLUMNAS_RECIBO)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          await this.crearConfiguracionPorDefecto();
          return;
        }
        throw error;
      }

      if (data) {
        this.configRecibo.set(data as ConfigRecibo);
        if (data.logo_url) {
          this.previsualizacionLogo.set(data.logo_url);
        }
      }
    } catch (error) {
      console.error('Error recibo:', error);
    }
  }

  private async crearConfiguracionPorDefecto(): Promise<void> {
    const { id, ...datosIniciales } = this.configRecibo();
    const { data, error } = await this.supabase.getClient()
      .from('configuracion_recibo')
      .insert(datosIniciales)
      .select(this.COLUMNAS_RECIBO)
      .single();
      
    if (!error && data) {
      this.configRecibo.set(data as ConfigRecibo);
    }
  }

  async guardarConfigRecibo(): Promise<void> {
    if (this.isGuardando()) return;
    this.isGuardando.set(true);

    try {
      let nuevaUrlLogo = this.configRecibo().logo_url;

      if (this.archivoLogo()) {
        nuevaUrlLogo = await this.procesoSubidaLogo();
      }

      const config = this.configRecibo();
      if (!config.id) throw new Error('Falta ID');

      const updateData: Partial<ConfigRecibo> = {
        nombre_negocio: config.nombre_negocio,
        direccion: config.direccion,
        ciudad: config.ciudad,
        telefono1: config.telefono1,
        telefono2: config.telefono2,
        whatsapp1: config.whatsapp1,
        whatsapp2: config.whatsapp2,
        email_empresa: config.email_empresa,
        mensaje_agradecimiento: config.mensaje_agradecimiento,
        logo_url: nuevaUrlLogo,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase.getClient()
        .from('configuracion_recibo')
        .update(updateData)
        .eq('id', config.id)
        .select(this.COLUMNAS_RECIBO)
        .single();

      if (error) throw error;

      if (data) {
        this.configRecibo.set(data as ConfigRecibo);
        this.archivoLogo.set(null);
      }
      this.mostrarToast('Datos guardados exitosamente', 'success');

    } catch (error: any) {
      console.error(error);
      this.mostrarToast('Error al guardar cambios', 'error');
    } finally {
      this.isGuardando.set(false);
      this.isSubiendoLogo.set(false);
    }
  }

  // --- IMAGEN ---

  onLogoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      const f = input.files[0];
      if (!f.type.startsWith('image/') || f.size > 2 * 1024 * 1024) {
        this.mostrarToast('Imagen inválida (Max 2MB)', 'warning');
        return;
      }
      this.archivoLogo.set(f);
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previsualizacionLogo.set(e.target?.result as string);
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(f);
    }
  }

  private async procesoSubidaLogo(): Promise<string> {
    const archivo = this.archivoLogo();
    if (!archivo) throw new Error('No hay archivo');
    
    this.isSubiendoLogo.set(true);
    
    const client = this.supabase.getClient();
    const bucket = 'logos-recibo';
    const ext = archivo.name.split('.').pop();
    const nombre = `logo-${Date.now()}-${Math.floor(Math.random()*1000)}.${ext}`;

    const { error } = await client.storage.from(bucket).upload(nombre, archivo, { upsert: false });
    if (error) throw error;

    const { data } = client.storage.from(bucket).getPublicUrl(nombre);
    
    // Limpieza asíncrona del logo viejo
    const logoActual = this.configRecibo().logo_url;
    if (logoActual) {
      const oldName = logoActual.split('/').pop();
      if (oldName) client.storage.from(bucket).remove([oldName]).then();
    }

    return data.publicUrl;
  }

  eliminarLogoLocal(): void {
    this.configRecibo.update(config => ({ ...config, logo_url: null }));
    this.previsualizacionLogo.set(null);
    this.archivoLogo.set(null);
  }

  // --- TOAST ---

  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'warning' = 'success'): void {
  this.mensajeToast.set(mensaje);
  this.tipoMensajeToast.set(tipo);
  this.isToastVisible.set(true);
  
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
  this.toastTimeout = setTimeout(() => {
    this.isToastVisible.set(false);
    this.cdr.markForCheck();
  }, 3000);
}

  async cargarDatosFacturacion(): Promise<void> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('facturacion')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error cargando facturación:', error);
        return;
      }

      if (data) {
        data.reglas_facturacion = data.reglas_facturacion || {};
        this.facturacion.set(data as FacturacionConfig);
     } else {
        // Si no existe, usamos los valores por defecto del signal pero no guardamos aún en DB para no ensuciar
      }
    } catch (err) {
      console.error(err);
    }
  }

  // MÉTODO GUARDAR FACTURACIÓN (Nueva Tabla)
  async guardarFacturacion(): Promise<void> {
    if (this.isGuardando()) return;
    this.isGuardando.set(true);

    try {
      const datos = this.facturacion();
      const client = this.supabase.getClient();
      let result;

      // Si ya tiene ID, actualizamos
      if (datos.id) {
        result = await client
          .from('facturacion')
          .update({
            razon_social: datos.razon_social,
            cuit: datos.cuit,
            condicion_iva: datos.condicion_iva,
            ingresos_brutos: datos.ingresos_brutos,
            inicio_actividades: datos.inicio_actividades,
            punto_venta: datos.punto_venta,
            facturacion_habilitada: datos.facturacion_habilitada,
            reglas_facturacion: datos.reglas_facturacion,
            updated_at: new Date().toISOString()
          })
          .eq('id', datos.id)
          .select()
          .single();
      } else {
        // Si no tiene ID, insertamos
        result = await client
          .from('facturacion')
          .insert({
            razon_social: datos.razon_social,
            cuit: datos.cuit,
            condicion_iva: datos.condicion_iva,
            ingresos_brutos: datos.ingresos_brutos,
            inicio_actividades: datos.inicio_actividades,
            punto_venta: datos.punto_venta,
            facturacion_habilitada: datos.facturacion_habilitada,
            reglas_facturacion: datos.reglas_facturacion
          })
          .select()
          .single();
      }

      if (result.error) throw result.error;

      if (result.data) {
        this.facturacion.set(result.data as FacturacionConfig);
        this.mostrarToast('Datos de facturación guardados', 'success');
      }

    } catch (error: any) {
      console.error(error);
      this.mostrarToast('Error al guardar facturación', 'error');
    } finally {
      this.isGuardando.set(false);
      this.cdr.markForCheck();
    }
  }

  metodosPagoConfig = [
    { key: 'efectivo', label: 'Efectivo' },
    { key: 'transferencia', label: 'Transferencia' },
    { key: 'tarjeta_debito', label: 'Débito' },
    { key: 'tarjeta_credito', label: 'Crédito' },
    { key: 'mercado_pago', label: 'Mercado Pago' }
  ];
}