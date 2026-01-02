console.log('🔄 Refreshing Service Worker...');

if ('serviceWorker' in navigator) {
    // Unregister all service workers
    navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log(`Found ${registrations.length} service worker(s)`);

        const unregisterPromises = registrations.map(registration => {
            console.log('Unregistering service worker...');
            return registration.unregister();
        });

        Promise.all(unregisterPromises).then(() => {
            console.log('✅ All service workers unregistered');
            console.log('🔄 Reloading page in 500ms...');

            // Clear all caches for good measure
            if ('caches' in window) {
                caches.keys().then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => {
                            console.log('Deleting cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                    );
                }).then(() => {
                    console.log('✅ All caches cleared');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    window.location.href = '/';
                }, 500);
            }
        });
    });
} else {
    console.log('❌ Service Worker not supported');
    window.location.href = '/';
}
