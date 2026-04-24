import{b as e,r,f as n,j as o,c as t}from"./iframe-PWRwx8BB.js";import{k as s}from"./emotion-react.browser.esm-DXTjaJhv.js";import{C as a}from"./colors-values-EcrvveBb.js";import{C as i}from"./config-values-BjZjT5-g.js";const p=s`
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
 `,c=e("svg",{target:"ea4tfvq2"})("width:",i.spinnerSize,"px;height:",i.spinnerSize,"px;display:inline-block;margin:5px 11px 0;position:relative;color:",a.theme.accent,";overflow:visible;opacity:1;background-color:transparent;"),f={name:"9s4963",styles:"fill:transparent;stroke-width:1.5px"},m=e("circle",{target:"ea4tfvq1"})(f,";stroke:",a.gray[300],";"),l=e("path",{target:"ea4tfvq0"})(f,";stroke:currentColor;stroke-linecap:round;transform-origin:50% 50%;animation:1.4s linear infinite both ",p,";");const d=r.forwardRef((function UnforwardedSpinner({className:e,...r},s){return n(c,{className:t("components-spinner",e),viewBox:"0 0 100 100",width:"16",height:"16",xmlns:"http://www.w3.org/2000/svg",role:"presentation",focusable:"false",...r,ref:s,children:[o(m,{cx:"50",cy:"50",r:"50",vectorEffect:"non-scaling-stroke"}),o(l,{d:"m 50 0 a 50 50 0 0 1 50 50",vectorEffect:"non-scaling-stroke"})]})}));d.displayName="Spinner";try{d.displayName="Spinner",d.__docgenInfo={description:"`Spinner` is a component used to notify users that their action is being processed.\n\n```jsx\nimport { Spinner } from '@wordpress/components';\n\nfunction Example() {\n\treturn <Spinner />;\n}\n```",displayName:"Spinner",props:{}}}catch(g){}export{d as S};
