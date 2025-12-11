import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';

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
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css'
})
export class ConfiguracionComponent implements OnInit, OnDestroy {
  // Inyecciones (Angular 19 style)
  private supabase = inject(SupabaseService);
  public themeService = inject(ThemeService); // Público para usar en HTML
  private cdr = inject(ChangeDetectorRef);

  activeTab: 'apariencia' | 'facturacion' | 'recibo' | 'contacto' = 'apariencia';
  
  // Estado de carga
  isLoading = true;
  
  // Cache del tema para evitar parpadeos por getters excesivos
  currentTheme: 'light' | 'dark' = 'light';

  // Configuración AFIP
  afipConfig: AfipConfig = {
    cuit: '',
    puntoVenta: '',
    certificado: '',
    clavePrivada: '',
    ambiente: 'homologacion'
  };

  // Configuración Recibo
  configRecibo: ConfigRecibo = {
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
  };

  // UI Logo
  archivoLogo: File | null = null;
  previsualizacionLogo: string | null = null;
  isSubiendoLogo = false;
  isGuardando = false;

  // Contacto (Readonly para optimizar memoria)
  readonly contactInfo = {
    email: 'prisys.solutions@gmail.com',
    telefono: '+54 3735475716',
    horario: 'Lunes a Viernes de 9:00 a 18:00'
  };

  // Toast
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600';
  private toastTimeout: any;

  // Intervalo para chequear tema (si el servicio no usa Signals/Observables)
  private themeInterval: any;

  async ngOnInit(): Promise<void> {
    // 1. Sincronizar tema inicial inmediatamente
    this.currentTheme = this.themeService.getCurrentTheme();
    
    // Hack de estabilidad: Chequear cambio de tema suavemente sin getters en el HTML
    // (Solo necesario si ThemeService no es reactivo con Signals)
    this.themeInterval = setInterval(() => {
        const t = this.themeService.getCurrentTheme();
        if(this.currentTheme !== t) {
            this.currentTheme = t;
            this.cdr.markForCheck(); // Actualizar vista solo si cambió
        }
    }, 1000);

    try {
      this.isLoading = true;
      
      // 2. Carga paralela
      await Promise.all([
        this.loadAfipConfig(),
        this.cargarConfigRecibo()
      ]);

    } catch (error) {
      console.error('Error carga inicial:', error);
      this.mostrarToast('Error de conexión', 'bg-red-600');
    } finally {
      // 3. Estabilización final
      this.isLoading = false;
      this.cdr.detectChanges(); // Forzar pintado final para evitar saltos
    }
  }

  ngOnDestroy(): void {
      if (this.themeInterval) clearInterval(this.themeInterval);
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  // --- MÉTODOS VISUALES ---
  
  // Usamos la propiedad cacheada en lugar del getter al servicio
  get theme() { return this.currentTheme; }

  setActiveTab(tab: typeof this.activeTab): void { 
    this.activeTab = tab; 
  }

  changeTheme(theme: 'light' | 'dark'): void { 
    this.themeService.setTheme(theme);
    this.currentTheme = theme; // Actualización optimista inmediata
  }

  // --- LÓGICA DE DATOS ---

  async loadAfipConfig(): Promise<void> {
    // Simulación rápida
    return Promise.resolve();
  }

  saveAfipConfig(): void {
    this.mostrarToast('Configuración AFIP guardada', 'bg-blue-600');
  }

  async cargarConfigRecibo(): Promise<void> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('configuracion_recibo')
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
           await this.crearConfiguracionPorDefecto();
           return;
        }
        throw error;
      }

      if (data) {
        this.configRecibo = data as ConfigRecibo;
        if (this.configRecibo.logo_url) {
          this.previsualizacionLogo = this.configRecibo.logo_url;
        }
      }
    } catch (error) {
      console.error('Error recibo:', error);
    }
  }

  private async crearConfiguracionPorDefecto(): Promise<void> {
    const { id, ...datosIniciales } = this.configRecibo;
    const { data, error } = await this.supabase.getClient()
      .from('configuracion_recibo')
      .insert(datosIniciales)
      .select()
      .single();
      
    if (!error && data) this.configRecibo = data as ConfigRecibo;
  }

  async guardarConfigRecibo(): Promise<void> {
    if (this.isGuardando) return;
    this.isGuardando = true;

    try {
      let nuevaUrlLogo = this.configRecibo.logo_url;

      if (this.archivoLogo) {
        nuevaUrlLogo = await this.procesoSubidaLogo();
      }

      if (!this.configRecibo.id) throw new Error('Falta ID');

      const updateData: Partial<ConfigRecibo> = {
        nombre_negocio: this.configRecibo.nombre_negocio,
        direccion: this.configRecibo.direccion,
        ciudad: this.configRecibo.ciudad,
        telefono1: this.configRecibo.telefono1,
        telefono2: this.configRecibo.telefono2,
        whatsapp1: this.configRecibo.whatsapp1,
        whatsapp2: this.configRecibo.whatsapp2,
        email_empresa: this.configRecibo.email_empresa,
        mensaje_agradecimiento: this.configRecibo.mensaje_agradecimiento,
        logo_url: nuevaUrlLogo,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase.getClient()
        .from('configuracion_recibo')
        .update(updateData)
        .eq('id', this.configRecibo.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        this.configRecibo = data as ConfigRecibo;
        this.archivoLogo = null;
      }
      this.mostrarToast('Datos guardados exitosamente', 'bg-green-600');

    } catch (error: any) {
      console.error(error);
      this.mostrarToast('Error al guardar cambios', 'bg-red-600');
    } finally {
      this.isGuardando = false;
      this.isSubiendoLogo = false;
    }
  }

  // --- IMAGEN ---

  onLogoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      const f = input.files[0];
      if (!f.type.startsWith('image/') || f.size > 2 * 1024 * 1024) {
        this.mostrarToast('Imagen inválida (Max 2MB)', 'bg-yellow-600');
        return;
      }
      this.archivoLogo = f;
      const reader = new FileReader();
      reader.onload = (e) => this.previsualizacionLogo = e.target?.result as string;
      reader.readAsDataURL(f);
    }
  }

  private async procesoSubidaLogo(): Promise<string> {
    if (!this.archivoLogo) throw new Error('No hay archivo');
    this.isSubiendoLogo = true;
    
    const client = this.supabase.getClient();
    const bucket = 'logos-recibo';
    const ext = this.archivoLogo.name.split('.').pop();
    const nombre = `logo-${Date.now()}-${Math.floor(Math.random()*1000)}.${ext}`;

    const { error } = await client.storage.from(bucket).upload(nombre, this.archivoLogo, { upsert: false });
    if (error) throw error;

    const { data } = client.storage.from(bucket).getPublicUrl(nombre);
    
    // Limpieza asíncrona del logo viejo (sin await para no trabar la UI)
    if (this.configRecibo.logo_url) {
        const oldName = this.configRecibo.logo_url.split('/').pop();
        if (oldName) client.storage.from(bucket).remove([oldName]).then();
    }

    return data.publicUrl;
  }

  eliminarLogoLocal(): void {
    this.configRecibo.logo_url = null;
    this.previsualizacionLogo = null;
    this.archivoLogo = null;
  }

  // --- TOAST ---

  mostrarToast(mensaje: string, color: string): void {
    this.toastMensaje = mensaje;
    this.toastColor = color;
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastVisible = false, 3000);
  }
}