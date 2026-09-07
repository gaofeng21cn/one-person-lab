# GUI Shell Adapter 切换验证

本文指导 shell adapter 切换后的接口与用户路径验证。当前 active shell、候选、页面和 release 由 `one-person-lab-app` contract决定，不在 Framework 文档中冻结。

责任与 Host scope 由 [架构](../../architecture.md#host-scope-boundary) 和 [Product 边界](../../product/README.md) 定义。本页用于验证 shell adapter 的切换，不另行指定 active shell。

## 切换 shell

切换只应影响 App adapter、shell源码、Application Host/carrier packaging和UI测试。Framework runtime和domain Package不随shell重写，也不迁移到 Studio Host。

完成切换必须验证 contract parity、packaged runtime、accessibility、启动/恢复、Settings和至少一条真实Package user path。候选源码或截图不能替代 App owner adoption decision。
