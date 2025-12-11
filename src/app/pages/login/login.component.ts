import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  email: string = '';
  password: string = '';
  error: string | null = null;
  
  // Estados de carga
  isLoading: boolean = false;       // Para el botón de submit
  isLoadingInitial: boolean = true; // NUEVO: Para la carga inicial de la página

  showPassword: boolean = false;
  dni: string = '';

  constructor(private supabase: SupabaseService, private router: Router,
    public themeService: ThemeService) {}

  async ngOnInit() {
    // Verificar si ya está logueado al cargar el componente
    try {
      const currentAppUser = await this.supabase.getCurrentAppUser();
      if (currentAppUser) {
        // Si ya está autenticado, redirigir según el rol
        await this.redirectByRole();
      } else {
        // Si no hay usuario, terminamos la carga inicial para mostrar el form
        this.isLoadingInitial = false;
      }
    } catch (e) {
      // Si falla la verificación, mostramos el form igual
      this.isLoadingInitial = false;
    }
    
    this.error = null;
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    this.error = null;
    this.isLoading = true;

    if (!this.email || !this.password) {
      this.error = 'Todos los campos son obligatorios';
      this.isLoading = false;
      return;
    }

    try {
      // Corregido: No desestructuramos { error } porque el servicio maneja errores internamente o devuelve datos
      await this.supabase.signInWithPassword(this.email, this.password);
      
      // Redirigir según el rol después del login exitoso
      await this.redirectByRole();
      
    } catch (error: unknown) {
      const err = error as { message: string };
      console.error('❌ Error en login:', err);
      if (err.message?.includes('Invalid login credentials')) {
        this.error = 'Credenciales incorrectas';
      } else {
        this.error = 'Error inesperado. Inténtalo de nuevo.';
      }
      this.isLoading = false; // Solo desactivar carga si hubo error
    }
  }

  private async redirectByRole() {
    try {
      const userRole = await this.supabase.getCurrentUserRole();

      if (userRole === 'admin') {
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      } else if (userRole === 'vendedor') {
        this.router.navigate(['/ventas'], { replaceUrl: true });
      } else {
        // Fallback: si no se reconoce el rol, ir a dashboard
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      }

    } catch (error) {
      console.error('Error en redirectByRole:', error);
      // Por defecto ir al dashboard
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }

  // CORREGIDO: Eliminado el parámetro 'dni' porque ya usamos this.dni del ngModel
  async loginVendedorPorDni() {
    this.error = null;
    this.isLoading = true;

    if (!this.dni) {
      this.error = 'El DNI es obligatorio';
      this.isLoading = false;
      return;
    }

    try {
      const { data, error } = await this.supabase.getClient()
        .from('vendedores')
        .select('*')
        .eq('dni', this.dni)
        .eq('activo', true)
        .single();

      if (error || !data) {
        this.error = 'DNI no encontrado o vendedor inactivo';
        this.isLoading = false;
        return;
      }

      // Crear sesión de vendedor en localStorage
      const vendedorSession = {
        id: data.id,
        rol: 'vendedor',
        nombre: data.nombre,
        dni: data.dni
      };
      localStorage.setItem('user', JSON.stringify(vendedorSession));

      // Marcar en el servicio
      this.supabase.setVendedorTemp(vendedorSession);

      // Redirigir a ventas
      this.router.navigate(['/ventas'], { replaceUrl: true });

    } catch (e) {
      this.error = 'Error al intentar ingresar como vendedor';
      console.error('Error en loginVendedorPorDni:', e);
      this.isLoading = false;
    }
  }
}