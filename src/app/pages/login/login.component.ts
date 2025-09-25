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

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    // Verificar si ya está logueado al cargar el componente
    const user = await this.supabase.getCurrentUser();
    if (user) {
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

      // Redirigir según el tipo de rol
      if (userRole === 'vendedor') {
        // Los vendedores van directo a ventas y no pueden salir de allí
        this.router.navigate(['/ventas'], { replaceUrl: true });
      } else {
        // Para admin u otros roles, ir al dashboard
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      }

    } catch (error) {
      console.error('Error en redirectByRole:', error);
      // Por defecto ir al dashboard (el guard se encargará de redirigir si no tiene permisos)
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }
}