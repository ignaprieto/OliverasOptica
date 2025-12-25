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
  
  isLoading: boolean = false;
  isLoadingInitial: boolean = true;
  showPassword: boolean = false;

  constructor(
    private supabase: SupabaseService, 
    private router: Router,
    public themeService: ThemeService
  ) {}

  async ngOnInit() {
    try {
      const currentAppUser = await this.supabase.getCurrentAppUser();
      if (currentAppUser) {
        await this.redirectByRole();
      } else {
        this.isLoadingInitial = false;
      }
    } catch (e) {
      this.isLoadingInitial = false;
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    this.error = null;
    this.isLoading = true;

    if (!this.email || !this.password) {
      this.error = 'Por favor ingresa usuario y contraseña';
      this.isLoading = false;
      return;
    }

    try {
      await this.supabase.signInWithPassword(this.email, this.password);
      // La redirección ocurre después de que el servicio actualiza el usuario
      await this.redirectByRole();
      
    } catch (error: any) {
      console.error('❌ Error en login:', error);
      if (error.message?.includes('Invalid login credentials')) {
        this.error = 'Credenciales incorrectas';
      } else {
        this.error = 'Error de conexión. Intenta nuevamente.';
      }
      this.isLoading = false;
    }
  }

 private async redirectByRole() {
    try {
      const user = await this.supabase.getCurrentUser();
      
      if (user) {
         // Todos al dashboard. El dashboard filtrará qué mostrar.
         await this.router.navigate(['/dashboard'], { replaceUrl: true });
      }
    } catch (error) {
      console.error('Error redirección:', error);
      // Fallback seguro
      this.router.navigate(['/login'], { replaceUrl: true });
    }
  }
}