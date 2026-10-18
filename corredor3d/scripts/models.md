# Modelos 3D (Poly Haven, CC0)

Os `.glb` em `public/models/<id>/` foram gerados com [glTF Transform](https://gltf-transform.dev) a partir dos originais 1k da Poly Haven:

```bash
gltf-transform weld     <id>.gltf w.glb
gltf-transform simplify w.glb s.glb --ratio <0.12..0.4> --error 0.02   # ~70-90% menos triângulos
gltf-transform webp     s.glb <id>.glb --slots "*"                      # texturas em WebP
gltf-transform resize   <id>.glb <id>_512.glb --width 512 --height 512  # variante para celular
```
