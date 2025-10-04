import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-configuracion',
  imports: [CommonModule, FormsModule, RouterModule],
  standalone: true,
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css'
})
export class ConfiguracionComponent implements OnInit {
  activeTab: 'apariencia' | 'facturacion' | 'contacto' = 'apariencia';
  
  // Configuración de Facturación AFIP
  afipConfig = {
    cuit: '',
    puntoVenta: '',
    certificado: '',
    clavePrivada: '',
    ambiente: 'homologacion' as 'produccion' | 'homologacion'
  };
  
  // Información de Contacto
  contactInfo = {
    email: 'prisys.solutions@gmail.com',
    telefono: '+54 3735475716',
    horario: 'Lunes a Viernes de 9:00 a 18:00'
  };

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.loadAfipConfig();
  }

  setActiveTab(tab: 'apariencia' | 'facturacion' | 'contacto'): void {
    this.activeTab = tab;
  }

  // Getter para acceder al tema actual
  get theme() {
    return this.themeService.getCurrentTheme();
  }

  // Cambiar el tema usando el servicio
  changeTheme(theme: 'light' | 'dark'): void {
    this.themeService.setTheme(theme);
  }

  loadAfipConfig(): void {
    // Aquí cargarías la configuración desde tu backend/Supabase
    // this.supabase.getAfipConfig().subscribe(...)
  }

  saveAfipConfig(): void {
    // Aquí guardarías la configuración en tu backend/Supabase
    console.log('Guardando configuración AFIP:', this.afipConfig);
    alert('Configuración de AFIP guardada correctamente');
  }
}