import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createInstanced(geometry, material, positions, colorFunc) {
    const im = new THREE.InstancedMesh(geometry, material, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((tp, i) => {
        dummy.position.set(tp.x, tp.y, tp.z);
        dummy.scale.set(tp.scale, tp.scale, tp.scale);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (colorFunc) im.setColorAt(i, colorFunc(tp));
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
}

export function getTreeGeometries() {
    const trunkColor = new THREE.Color(0x4d2926);
    const pineColor = new THREE.Color(0x1b3012);
    const oakColor = new THREE.Color(0x3a5f0b);
    const palmTrunkColor = new THREE.Color(0x5c4033);
    const palmLeafColor = new THREE.Color(0x228b22);
    const cactusColor = new THREE.Color(0x2d5a27);

    const treeTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.2, 0.4, 4, 6), trunkColor);
    treeTrunkGeo.translate(0, 2, 0);
    const treeFoliageGeo = setGeometryColor(new THREE.ConeGeometry(2, 6, 6), pineColor);
    treeFoliageGeo.translate(0, 5, 0);
    const pineGeo = mergeGeometries([treeTrunkGeo, treeFoliageGeo]);

    const oakTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.5, 3, 6), trunkColor);
    oakTrunkGeo.translate(0, 1.5, 0);
    const oakFoliageGeo = setGeometryColor(new THREE.SphereGeometry(2, 8, 8), oakColor);
    oakFoliageGeo.translate(0, 4, 0);
    const oakGeo = mergeGeometries([oakTrunkGeo, oakFoliageGeo]);

    const palmTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.2, 0.35, 6, 6), palmTrunkColor);
    palmTrunkGeo.translate(0, 3, 0);
    const palmLeaf1 = setGeometryColor(new THREE.CylinderGeometry(0.05, 0.8, 4, 3), palmLeafColor);
    palmLeaf1.rotateX(1.8);
    palmLeaf1.translate(0, 6, 2);
    const palmLeaf2 = palmLeaf1.clone().rotateY(Math.PI * 0.4);
    const palmLeaf3 = palmLeaf1.clone().rotateY(Math.PI * 0.8);
    const palmLeaf4 = palmLeaf1.clone().rotateY(Math.PI * 1.2);
    const palmLeaf5 = palmLeaf1.clone().rotateY(Math.PI * 1.6);
    const palmGeo = mergeGeometries([palmTrunkGeo, palmLeaf1, palmLeaf2, palmLeaf3, palmLeaf4, palmLeaf5]);

    const cactusBody = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), cactusColor);
    cactusBody.translate(0, 1.5, 0);
    const cactusArm = setGeometryColor(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 6), cactusColor);
    cactusArm.rotateZ(Math.PI / 2);
    cactusArm.translate(0.6, 2, 0);
    const cactusGeo = mergeGeometries([cactusBody, cactusArm]);

    return { pineGeo, oakGeo, palmGeo, cactusGeo };
}

function setGeometryColor(geo, color) {
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
}

export function getBuildingGeometries() {
    // Rural: Red body, dark roof
    const ruralBody = setGeometryColor(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.Color(0x8b0000));
    ruralBody.translate(0, 0.4, 0);
    const ruralRoof = setGeometryColor(new THREE.BoxGeometry(0.9, 0.4, 0.9), new THREE.Color(0x222222));
    ruralRoof.translate(0, 0.8, 0);
    const ruralGeo = mergeGeometries([ruralBody, ruralRoof]);

    // Suburban: Tan body, dark sloped roof
    const subBody = setGeometryColor(new THREE.BoxGeometry(1.2, 0.8, 1.2), new THREE.Color(0xddccbb));
    subBody.translate(0, 0.4, 0);
    const subRoof = setGeometryColor(new THREE.ConeGeometry(1.1, 0.6, 4), new THREE.Color(0x333333));
    subRoof.rotateY(Math.PI / 4);
    subRoof.translate(0, 1.1, 0);
    const subGeo = mergeGeometries([subBody, subRoof]);

    // Urban: Dark blue body, yellow windows
    const urbBody = setGeometryColor(new THREE.BoxGeometry(1.5, 8, 1.5), new THREE.Color(0x223344));
    urbBody.translate(0, 4, 0);
    
    const windowGeos = [];
    const windowColor = new THREE.Color(0xffffaa);
    for(let f = 1; f < 8; f++) {
        for(let s = 0; s < 4; s++) {
            const w = setGeometryColor(new THREE.BoxGeometry(0.2, 0.2, 0.1), windowColor);
            const angle = s * (Math.PI / 2);
            // Transform geometry directly as BufferGeometry doesn't have position/rotation properties like Object3D
            w.rotateY(-angle);
            w.translate(Math.cos(angle) * 0.76, f * 1.0, Math.sin(angle) * 0.76);
            windowGeos.push(w);
        }
    }
    const urbGeo = mergeGeometries([urbBody, ...windowGeos]);

    // Space: Dome + Light + Tube
    const dome = setGeometryColor(new THREE.SphereGeometry(1.5, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Color(0xaaaaaa));
    const tube = setGeometryColor(new THREE.CylinderGeometry(0.5, 0.5, 2, 8), new THREE.Color(0xcccccc));
    tube.rotateZ(Math.PI / 2);
    tube.translate(1.5, 0.5, 0);
    const light = setGeometryColor(new THREE.SphereGeometry(0.25, 6, 6), new THREE.Color(0x00ff00));
    light.translate(0, 1.6, 0);
    const spaceGeo = mergeGeometries([dome, tube, light]);
    
    return { ruralGeo, subGeo, urbGeo, spaceGeo };
}