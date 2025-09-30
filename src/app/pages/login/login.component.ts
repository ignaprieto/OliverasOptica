import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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
  isLoading: boolean = false;
  showPassword: boolean = false;
  dni: string = '';

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    // Verificar si ya está logueado al cargar el componente
    const currentAppUser = await this.supabase.getCurrentAppUser();
    if (currentAppUser) {
      // Si ya está autenticado, redirigir según el rol
      await this.redirectByRole();
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
      await this.supabase.signInWithPassword(this.email, this.password);
      
      // Redirigir según el rol después del login exitoso
      await this.redirectByRole();
      
    } catch (error: any) {
      console.error('❌ Error en login:', error);
      if (error.message?.includes('Invalid login credentials')) {
        this.error = 'Credenciales incorrectas';
      } else {
        this.error = 'Error inesperado. Inténtalo de nuevo.';
      }
    } finally {
      this.isLoading = false;
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

  async loginVendedorPorDni(dni: string) {
    this.error = null;
    this.isLoading = true;

    if (!dni) {
      this.error = 'El DNI es obligatorio';
      this.isLoading = false;
      return;
    }

    try {
      const { data, error } = await this.supabase.getClient()
        .from('vendedores')
        .select('*')
        .eq('dni', dni)
        .eq('activo', true)
        .single();

      if (error || !data) {
        this.error = 'DNI no encontrado o vendedor inactivo';
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
    } finally {
      this.isLoading = false;
    }
  }
}