// Main JavaScript for Matthew Landis - Author Website

document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
            
            // Prevent scrolling when mobile menu is open
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : 'auto';
        });

        // Close menu when link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = 'auto';
            });
        });
    }

    // 2. Header Scroll Effect
    const header = document.querySelector('header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }

    // 3. Dynamic Copyright Year
    const copyrightYear = document.getElementById('copyright-year');
    if (copyrightYear) {
        copyrightYear.textContent = new Date().getFullYear();
    }

    // 4. Fade-in Scroll Animations
    const fadeElements = document.querySelectorAll('.fade-in');
    
    if ('IntersectionObserver' in window) {
        const observerOptions = {
            root: null,
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target); // Stop observing once visible
                }
            });
        }, observerOptions);

        fadeElements.forEach(el => observer.observe(el));
    } else {
        // Fallback for older browsers
        fadeElements.forEach(el => el.classList.add('visible'));
    }

    // 5. Hero Carousel
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');
    const prevBtn = document.querySelector('.carousel-prev');
    const nextBtn = document.querySelector('.carousel-next');
    const carousel = document.querySelector('.hero-carousel');

    if (slides.length > 0) {
        let currentSlide = 0;
        let slideInterval = null;

        const goToSlide = (index) => {
            slides[currentSlide].classList.remove('active');
            if (indicators[currentSlide]) indicators[currentSlide].classList.remove('active');
            
            currentSlide = (index + slides.length) % slides.length;

            slides[currentSlide].classList.add('active');
            if (indicators[currentSlide]) indicators[currentSlide].classList.add('active');
        };

        const nextSlide = () => goToSlide(currentSlide + 1);
        const prevSlide = () => goToSlide(currentSlide - 1);

        const startAutoPlay = () => {
            if (!slideInterval) {
                slideInterval = setInterval(nextSlide, 4000);
            }
        };

        const stopAutoPlay = () => {
            clearInterval(slideInterval);
            slideInterval = null;
        };

        if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); stopAutoPlay(); startAutoPlay(); });
        if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); stopAutoPlay(); startAutoPlay(); });

        indicators.forEach((ind, i) => {
            ind.addEventListener('click', () => {
                goToSlide(i);
                stopAutoPlay();
                startAutoPlay();
            });
        });

        if (carousel) {
            carousel.addEventListener('mouseenter', stopAutoPlay);
            carousel.addEventListener('mouseleave', startAutoPlay);
        }

        startAutoPlay();
    }

    // 6. Educator Quote Carousel Banner
    const quoteSlides = document.querySelectorAll('.quote-slide');
    const quotePrev = document.querySelector('.quote-prev');
    const quoteNext = document.querySelector('.quote-next');
    if (quoteSlides.length > 0) {
        let currentQuote = 0;
        let quoteInterval = null;

        const showQuote = (index) => {
            quoteSlides[currentQuote].classList.remove('active');
            currentQuote = (index + quoteSlides.length) % quoteSlides.length;
            quoteSlides[currentQuote].classList.add('active');
        };

        const nextQuote = () => showQuote(currentQuote + 1);
        const prevQuote = () => showQuote(currentQuote - 1);

        const startQuoteTimer = () => {
            if (!quoteInterval) quoteInterval = setInterval(nextQuote, 5000);
        };
        const stopQuoteTimer = () => {
            clearInterval(quoteInterval);
            quoteInterval = null;
        };

        if (quoteNext) quoteNext.addEventListener('click', () => { nextQuote(); stopQuoteTimer(); startQuoteTimer(); });
        if (quotePrev) quotePrev.addEventListener('click', () => { prevQuote(); stopQuoteTimer(); startQuoteTimer(); });

        const quoteBanner = document.querySelector('.quote-spotlight-banner');
        if (quoteBanner) {
            quoteBanner.addEventListener('mouseenter', stopQuoteTimer);
            quoteBanner.addEventListener('mouseleave', startQuoteTimer);
        }
        startQuoteTimer();
    }

    // 7. About Page Carousel
    const aboutSlides = document.querySelectorAll('.about-slide');
    const aboutIndicators = document.querySelectorAll('.about-indicator');
    const aboutPrev = document.querySelector('.about-prev');
    const aboutNext = document.querySelector('.about-next');
    const aboutCarousel = document.querySelector('.about-carousel');

    if (aboutSlides.length > 0) {
        let currentAboutSlide = 0;
        let aboutInterval = null;

        const goToAboutSlide = (index) => {
            aboutSlides[currentAboutSlide].classList.remove('active');
            if (aboutIndicators[currentAboutSlide]) aboutIndicators[currentAboutSlide].classList.remove('active');
            
            currentAboutSlide = (index + aboutSlides.length) % aboutSlides.length;

            aboutSlides[currentAboutSlide].classList.add('active');
            if (aboutIndicators[currentAboutSlide]) aboutIndicators[currentAboutSlide].classList.add('active');
        };

        const nextAboutSlide = () => goToAboutSlide(currentAboutSlide + 1);
        const prevAboutSlide = () => goToAboutSlide(currentAboutSlide - 1);

        const startAboutAutoPlay = () => {
            if (!aboutInterval) {
                aboutInterval = setInterval(nextAboutSlide, 4000);
            }
        };

        const stopAboutAutoPlay = () => {
            clearInterval(aboutInterval);
            aboutInterval = null;
        };

        if (aboutNext) aboutNext.addEventListener('click', () => { nextAboutSlide(); stopAboutAutoPlay(); startAboutAutoPlay(); });
        if (aboutPrev) aboutPrev.addEventListener('click', () => { prevAboutSlide(); stopAboutAutoPlay(); startAboutAutoPlay(); });

        aboutIndicators.forEach((ind, i) => {
            ind.addEventListener('click', () => {
                goToAboutSlide(i);
                stopAboutAutoPlay();
                startAboutAutoPlay();
            });
        });

        if (aboutCarousel) {
            aboutCarousel.addEventListener('mouseenter', stopAboutAutoPlay);
            aboutCarousel.addEventListener('mouseleave', startAboutAutoPlay);
        }

        startAboutAutoPlay();
    }

    // 8. Contact Form AJAX Submission
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');
    const statusIcon = formStatus?.querySelector('.status-icon');
    const statusTitle = formStatus?.querySelector('.status-title');
    const statusDesc = formStatus?.querySelector('.status-desc');
    const submitBtn = contactForm?.querySelector('button[type="submit"]');

    if (contactForm) {
        // Change the form action to AJAX URL dynamically
        const ajaxAction = contactForm.action.replace('formsubmit.co/', 'formsubmit.co/ajax/');

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Reset status banner
            if (formStatus) {
                formStatus.style.display = 'none';
                formStatus.className = 'form-status-banner';
            }
            
            // Set button to loading state
            const originalBtnText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.classList.add('btn-loading');
            submitBtn.disabled = true;

            const formData = new FormData(contactForm);
            const data = {};
            formData.forEach((value, key) => {
                data[key] = value;
            });

            // Local Honeypot check
            if (data['_honey'] && data['_honey'].trim() !== '') {
                console.log('Spam submission blocked client-side.');
                showStatus('success', 'Message Sent!', 'Thank you for reaching out! Matt will get back to you as soon as possible.');
                contactForm.reset();
                submitBtn.textContent = originalBtnText;
                submitBtn.classList.remove('btn-loading');
                submitBtn.disabled = false;
                return;
            }

            try {
                const response = await fetch(ajaxAction, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    showStatus('success', 'Message Sent!', 'Thank you for reaching out! Matt will get back to you as soon as possible.');
                    contactForm.reset();
                } else {
                    const errResult = await response.json().catch(() => ({}));
                    showStatus('error', 'Submission Failed', errResult.message || 'There was an error sending your message. Please try again later.');
                }
            } catch (error) {
                console.error('Error submitting form:', error);
                showStatus('error', 'Network Error', 'Could not connect to the form submission service. Please check your internet connection and try again.');
            } finally {
                submitBtn.textContent = originalBtnText;
                submitBtn.classList.remove('btn-loading');
                submitBtn.disabled = false;
            }
        });

        function showStatus(type, title, message) {
            if (!formStatus || !statusTitle || !statusDesc) return;
            
            formStatus.classList.add(type);
            statusTitle.textContent = title;
            statusDesc.textContent = message;
            
            if (statusIcon) {
                statusIcon.textContent = type === 'success' ? '🎉' : '❌';
            }
            
            formStatus.style.display = 'block';
            formStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
});
