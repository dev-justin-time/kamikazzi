import * as THREE from "three";

/**
 * getBallMaterial
 */
export function getBallMaterial(game) {
        const conf = game.ballConfigs[game.saveData.selectedBall] || game.ballConfigs.rainbow;

        // GIF animated skin: use the Image-based texture (browser advances GIF frames)
        if (conf.type === 'gif') {
            if (game.gifTexture) {
                return new THREE.MeshBasicMaterial({
                    map: game.gifTexture,
                });
            }
            return new THREE.MeshBasicMaterial({ color: 0xffffff });
        }

        // Regular static textures
        if (conf.type === 'texture') {
            const tex = game.textureLoader.load(conf.tex);
            return new THREE.MeshPhongMaterial({ map: tex });
        } else if (conf.type === 'color') {
            return new THREE.MeshPhongMaterial({ color: conf.color, shininess: conf.shininess });
        } else if (conf.type === 'emissive') {
            return new THREE.MeshPhongMaterial({ color: conf.color, emissive: conf.emissive });
        }

        // "Glass" materials: simulate an inner 2D image seen through a glossy/transmissive sphere.
        if (conf.type === 'glass') {
            // load the inner image as a texture
            const innerTex = game.textureLoader.load(conf.tex);
            innerTex.encoding = THREE.sRGBEncoding;

            // base layer: slightly glossy reflective outer shell
            const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                metalness: 0.0,
                roughness: 0.15,
                transmission: 0.9,      // glass-like transparency
                thickness: 0.6,
                envMapIntensity: 0.7,
                clearcoat: 0.4,
                clearcoatRoughness: 0.05,
                reflectivity: 0.6,
                transparent: true,
                side: THREE.FrontSide
            });

            // inner decal: rendered by using a second material that maps the image and is slightly emissive
            // We'll create a MultiMaterial-style Mesh with same geometry when applying; since Ball uses a single mesh,
            // return a special object describing both materials and let caller handle assignment:
            // To keep compatibility, create a Shader-like approach by combining map into a standard material with slight emissive.
            const innerMat = new THREE.MeshBasicMaterial({
                map: innerTex,
                transparent: true,
                depthWrite: false,
                toneMapped: false
            });

            // To approximate "image inside glass" with a single mesh, create a grouped material using MeshPhysical for lighting
            // but mix in the inner texture as an emissiveMap to make it visible under glass.
            const combined = new THREE.MeshPhysicalMaterial({
                map: innerTex,
                emissiveMap: innerTex,
                emissiveIntensity: 0.08,
                color: 0xffffff,
                metalness: 0.0,
                roughness: 0.3,
                transmission: 0.85,
                thickness: 0.5,
                clearcoat: 0.4,
                clearcoatRoughness: 0.05,
                envMapIntensity: 0.6,
                reflectivity: 0.6,
                transparent: true
            });

            return combined;
        }

        return new THREE.MeshPhongMaterial({ color: 0xffffff });
}

