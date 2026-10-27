// Shared home-page animation and site-wide effects.
// Interactive Hero Canvas Animation
        const canvas = document.getElementById('hero-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            let width = canvas.width = canvas.offsetWidth;
            let height = canvas.height = canvas.offsetHeight;

            window.addEventListener('resize', () => {
                width = canvas.width = canvas.offsetWidth;
                height = canvas.height = canvas.offsetHeight;
            });

            class Particle {
                constructor() {
                    this.reset();
                }
                reset() {
                    this.x = Math.random() * width;
                    this.y = Math.random() * height;
                    this.vx = (Math.random() - 0.5) * 0.8;
                    this.vy = (Math.random() - 0.5) * 0.8;
                    this.radius = Math.random() * 3 + 2;
                    this.color = Math.random() > 0.4 ? '#FFC700' : '#06B6D4';
                }
                update() {
                    this.x += this.vx;
                    this.y += this.vy;
                    if (this.x < 0 || this.x > width) this.vx *= -1;
                    if (this.y < 0 || this.y > height) this.vy *= -1;
                }
                draw() {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                    ctx.fillStyle = this.color;
                    ctx.globalAlpha = 0.6;
                    ctx.fill();
                }
            }

            const particles = Array.from({ length: 40 }, () => new Particle());

            function animateCanvas() {
                ctx.clearRect(0, 0, width, height);
                for (let i = 0; i < particles.length; i++) {
                    particles[i].update();
                    particles[i].draw();
                    for (let j = i + 1; j < particles.length; j++) {
                        const dx = particles[i].x - particles[j].x;
                        const dy = particles[i].y - particles[j].y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 100) {
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.strokeStyle = '#475569';
                            ctx.globalAlpha = (1 - dist / 100) * 0.25;
                            ctx.stroke();
                        }
                    }
                }
                requestAnimationFrame(animateCanvas);
            }
            animateCanvas();
        }
