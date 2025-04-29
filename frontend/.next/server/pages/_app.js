/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "pages/_app";
exports.ids = ["pages/_app"];
exports.modules = {

/***/ "(pages-dir-node)/./pages/_app.tsx":
/*!************************!*\
  !*** ./pages/_app.tsx ***!
  \************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {\n__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ App)\n/* harmony export */ });\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"react/jsx-dev-runtime\");\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../styles/globals.css */ \"(pages-dir-node)/./styles/globals.css\");\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_styles_globals_css__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ \"react\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var react_hot_toast__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-hot-toast */ \"react-hot-toast\");\nvar __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([react_hot_toast__WEBPACK_IMPORTED_MODULE_3__]);\nreact_hot_toast__WEBPACK_IMPORTED_MODULE_3__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];\n\n\n\n\nfunction App({ Component, pageProps }) {\n    const [isOnline, setIsOnline] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(true);\n    (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)({\n        \"App.useEffect\": ()=>{\n            // Check initial online status\n            setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);\n            // Add event listeners for online/offline status\n            const handleOnline = {\n                \"App.useEffect.handleOnline\": ()=>{\n                    setIsOnline(true);\n                    react_hot_toast__WEBPACK_IMPORTED_MODULE_3__.toast.success('Подключение к сети восстановлено!');\n                }\n            }[\"App.useEffect.handleOnline\"];\n            const handleOffline = {\n                \"App.useEffect.handleOffline\": ()=>{\n                    setIsOnline(false);\n                    react_hot_toast__WEBPACK_IMPORTED_MODULE_3__.toast.error('Отсутствует подключение к интернету. Некоторые функции могут быть недоступны.');\n                }\n            }[\"App.useEffect.handleOffline\"];\n            window.addEventListener('online', handleOnline);\n            window.addEventListener('offline', handleOffline);\n            return ({\n                \"App.useEffect\": ()=>{\n                    window.removeEventListener('online', handleOnline);\n                    window.removeEventListener('offline', handleOffline);\n                }\n            })[\"App.useEffect\"];\n        }\n    }[\"App.useEffect\"], []);\n    return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {\n        children: [\n            /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(react_hot_toast__WEBPACK_IMPORTED_MODULE_3__.Toaster, {\n                position: \"top-right\",\n                toastOptions: {\n                    duration: 6000,\n                    style: {\n                        borderRadius: '8px',\n                        background: '#333',\n                        color: '#fff'\n                    }\n                }\n            }, void 0, false, {\n                fileName: \"/Users/aldiyarbolegenov/tender/frontend/pages/_app.tsx\",\n                lineNumber: 35,\n                columnNumber: 7\n            }, this),\n            !isOnline && /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"div\", {\n                className: \"fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 z-50\",\n                children: \"Вы не подключены к интернету. Работаем в оффлайн режиме.\"\n            }, void 0, false, {\n                fileName: \"/Users/aldiyarbolegenov/tender/frontend/pages/_app.tsx\",\n                lineNumber: 47,\n                columnNumber: 9\n            }, this),\n            /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(Component, {\n                ...pageProps\n            }, void 0, false, {\n                fileName: \"/Users/aldiyarbolegenov/tender/frontend/pages/_app.tsx\",\n                lineNumber: 51,\n                columnNumber: 7\n            }, this)\n        ]\n    }, void 0, true);\n}\n\n__webpack_async_result__();\n} catch(e) { __webpack_async_result__(e); } });//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHBhZ2VzLWRpci1ub2RlKS8uL3BhZ2VzL19hcHAudHN4IiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUErQjtBQUVhO0FBQ0s7QUFFbEMsU0FBU0ksSUFBSSxFQUFFQyxTQUFTLEVBQUVDLFNBQVMsRUFBWTtJQUM1RCxNQUFNLENBQUNDLFVBQVVDLFlBQVksR0FBR1AsK0NBQVFBLENBQUM7SUFFekNELGdEQUFTQTt5QkFBQztZQUNSLDhCQUE4QjtZQUM5QlEsWUFBWSxPQUFPQyxjQUFjLGNBQWNBLFVBQVVDLE1BQU0sR0FBRztZQUVsRSxnREFBZ0Q7WUFDaEQsTUFBTUM7OENBQWU7b0JBQ25CSCxZQUFZO29CQUNaTCxrREFBS0EsQ0FBQ1MsT0FBTyxDQUFDO2dCQUNoQjs7WUFFQSxNQUFNQzsrQ0FBZ0I7b0JBQ3BCTCxZQUFZO29CQUNaTCxrREFBS0EsQ0FBQ1csS0FBSyxDQUFDO2dCQUNkOztZQUVBQyxPQUFPQyxnQkFBZ0IsQ0FBQyxVQUFVTDtZQUNsQ0ksT0FBT0MsZ0JBQWdCLENBQUMsV0FBV0g7WUFFbkM7aUNBQU87b0JBQ0xFLE9BQU9FLG1CQUFtQixDQUFDLFVBQVVOO29CQUNyQ0ksT0FBT0UsbUJBQW1CLENBQUMsV0FBV0o7Z0JBQ3hDOztRQUNGO3dCQUFHLEVBQUU7SUFFTCxxQkFDRTs7MEJBQ0UsOERBQUNYLG9EQUFPQTtnQkFDTmdCLFVBQVM7Z0JBQ1RDLGNBQWM7b0JBQ1pDLFVBQVU7b0JBQ1ZDLE9BQU87d0JBQ0xDLGNBQWM7d0JBQ2RDLFlBQVk7d0JBQ1pDLE9BQU87b0JBQ1Q7Z0JBQ0Y7Ozs7OztZQUVELENBQUNqQiwwQkFDQSw4REFBQ2tCO2dCQUFJQyxXQUFVOzBCQUF5RTs7Ozs7OzBCQUkxRiw4REFBQ3JCO2dCQUFXLEdBQUdDLFNBQVM7Ozs7Ozs7O0FBRzlCIiwic291cmNlcyI6WyIvVXNlcnMvYWxkaXlhcmJvbGVnZW5vdi90ZW5kZXIvZnJvbnRlbmQvcGFnZXMvX2FwcC50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICcuLi9zdHlsZXMvZ2xvYmFscy5jc3MnO1xuaW1wb3J0IHR5cGUgeyBBcHBQcm9wcyB9IGZyb20gJ25leHQvYXBwJztcbmltcG9ydCB7IHVzZUVmZmVjdCwgdXNlU3RhdGUgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyBUb2FzdGVyLCB0b2FzdCB9IGZyb20gJ3JlYWN0LWhvdC10b2FzdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEFwcCh7IENvbXBvbmVudCwgcGFnZVByb3BzIH06IEFwcFByb3BzKSB7XG4gIGNvbnN0IFtpc09ubGluZSwgc2V0SXNPbmxpbmVdID0gdXNlU3RhdGUodHJ1ZSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAvLyBDaGVjayBpbml0aWFsIG9ubGluZSBzdGF0dXNcbiAgICBzZXRJc09ubGluZSh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyA/IG5hdmlnYXRvci5vbkxpbmUgOiB0cnVlKTtcblxuICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lcnMgZm9yIG9ubGluZS9vZmZsaW5lIHN0YXR1c1xuICAgIGNvbnN0IGhhbmRsZU9ubGluZSA9ICgpID0+IHtcbiAgICAgIHNldElzT25saW5lKHRydWUpO1xuICAgICAgdG9hc3Quc3VjY2Vzcygn0J/QvtC00LrQu9GO0YfQtdC90LjQtSDQuiDRgdC10YLQuCDQstC+0YHRgdGC0LDQvdC+0LLQu9C10L3QviEnKTtcbiAgICB9O1xuICAgIFxuICAgIGNvbnN0IGhhbmRsZU9mZmxpbmUgPSAoKSA9PiB7XG4gICAgICBzZXRJc09ubGluZShmYWxzZSk7XG4gICAgICB0b2FzdC5lcnJvcign0J7RgtGB0YPRgtGB0YLQstGD0LXRgiDQv9C+0LTQutC70Y7Rh9C10L3QuNC1INC6INC40L3RgtC10YDQvdC10YLRgy4g0J3QtdC60L7RgtC+0YDRi9C1INGE0YPQvdC60YbQuNC4INC80L7Qs9GD0YIg0LHRi9GC0Ywg0L3QtdC00L7RgdGC0YPQv9C90YsuJyk7XG4gICAgfTtcbiAgICBcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignb25saW5lJywgaGFuZGxlT25saW5lKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignb2ZmbGluZScsIGhhbmRsZU9mZmxpbmUpO1xuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBoYW5kbGVPbmxpbmUpO1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ29mZmxpbmUnLCBoYW5kbGVPZmZsaW5lKTtcbiAgICB9O1xuICB9LCBbXSk7XG5cbiAgcmV0dXJuIChcbiAgICA8PlxuICAgICAgPFRvYXN0ZXIgXG4gICAgICAgIHBvc2l0aW9uPVwidG9wLXJpZ2h0XCJcbiAgICAgICAgdG9hc3RPcHRpb25zPXt7XG4gICAgICAgICAgZHVyYXRpb246IDYwMDAsXG4gICAgICAgICAgc3R5bGU6IHtcbiAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzhweCcsIFxuICAgICAgICAgICAgYmFja2dyb3VuZDogJyMzMzMnLCBcbiAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfX1cbiAgICAgIC8+XG4gICAgICB7IWlzT25saW5lICYmIChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmaXhlZCB0b3AtMCBsZWZ0LTAgcmlnaHQtMCBiZy1yZWQtNTAwIHRleHQtd2hpdGUgdGV4dC1jZW50ZXIgcHktMiB6LTUwXCI+XG4gICAgICAgICAg0JLRiyDQvdC1INC/0L7QtNC60LvRjtGH0LXQvdGLINC6INC40L3RgtC10YDQvdC10YLRgy4g0KDQsNCx0L7RgtCw0LXQvCDQsiDQvtGE0YTQu9Cw0LnQvSDRgNC10LbQuNC80LUuXG4gICAgICAgIDwvZGl2PlxuICAgICAgKX1cbiAgICAgIDxDb21wb25lbnQgey4uLnBhZ2VQcm9wc30gLz5cbiAgICA8Lz5cbiAgKTtcbn0gIl0sIm5hbWVzIjpbInVzZUVmZmVjdCIsInVzZVN0YXRlIiwiVG9hc3RlciIsInRvYXN0IiwiQXBwIiwiQ29tcG9uZW50IiwicGFnZVByb3BzIiwiaXNPbmxpbmUiLCJzZXRJc09ubGluZSIsIm5hdmlnYXRvciIsIm9uTGluZSIsImhhbmRsZU9ubGluZSIsInN1Y2Nlc3MiLCJoYW5kbGVPZmZsaW5lIiwiZXJyb3IiLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwicmVtb3ZlRXZlbnRMaXN0ZW5lciIsInBvc2l0aW9uIiwidG9hc3RPcHRpb25zIiwiZHVyYXRpb24iLCJzdHlsZSIsImJvcmRlclJhZGl1cyIsImJhY2tncm91bmQiLCJjb2xvciIsImRpdiIsImNsYXNzTmFtZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(pages-dir-node)/./pages/_app.tsx\n");

/***/ }),

/***/ "(pages-dir-node)/./styles/globals.css":
/*!****************************!*\
  !*** ./styles/globals.css ***!
  \****************************/
/***/ (() => {



/***/ }),

/***/ "react":
/*!************************!*\
  !*** external "react" ***!
  \************************/
/***/ ((module) => {

"use strict";
module.exports = require("react");

/***/ }),

/***/ "react-hot-toast":
/*!**********************************!*\
  !*** external "react-hot-toast" ***!
  \**********************************/
/***/ ((module) => {

"use strict";
module.exports = import("react-hot-toast");;

/***/ }),

/***/ "react/jsx-dev-runtime":
/*!****************************************!*\
  !*** external "react/jsx-dev-runtime" ***!
  \****************************************/
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-dev-runtime");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__("(pages-dir-node)/./pages/_app.tsx"));
module.exports = __webpack_exports__;

})();