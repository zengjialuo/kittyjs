# KittyJS(SimpleAndNaiveJS)

KittyJS is a super lightweight but indeed complete AMD-compliant module loader with:

- Loader Plugin supported;
- Common Config supported, include BaseUrl、paths、packages、map、config and shim.

it was originally named as 'SimpleAndNaiveJS', since its implement is really simple. In fact, it just has about 600 source code lines, but it actually works.

## KittyJS vs requireJS
| Item      |  KittyJS | requireJS  | esl |
| :-- | --:| --: | --: |
| Size      | 2.8kb  |  6.2kb | 3.7kb |
| Performance  | - |  almost  | same |
| Shim support | YES | YES | NO |
| Timeout handler| NO | YES | YES |

## Usage
```html
<script src="http://bcscdn.baidu.com/weigou-baidu-com/kittyjs/kitty.js"></script>
```

config options is same with requireJS

