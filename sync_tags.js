import { Client } from "@notionhq/client";

// --- 配置区域 ---
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const ARTICLE_DB_ID = process.env.DATABASE_ID;
const TAGS_DB_ID = process.env.TAGS_DB_ID;

const PROPS = {
    RELATION: "Tag",  // 你的关联属性名 (本地文章库里的)
    SELECT: "tags"    // 你的多选属性名 (NotionNext 用的)
};
// ----------------

async function getTagMap() {
    console.log(`\n🔍 正在读取全局标签库 (ID: ${TAGS_DB_ID})...`);
    const tagMap = {};
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const res = await notion.databases.query({
            database_id: TAGS_DB_ID,
            start_cursor: cursor,
        });

        for (const page of res.results) {
            // 🌟 智能获取标题：找到类型为 title 的属性，不管它叫 Name 还是 Title
            const titlePropKey = Object.keys(page.properties).find(key => page.properties[key].type === 'title');
            if (titlePropKey) {
                const titleContent = page.properties[titlePropKey].title;
                if (titleContent.length > 0) {
                    tagMap[page.id] = titleContent[0].plain_text;
                }
            }
        }
        hasMore = res.has_more;
        cursor = res.next_cursor;
    }
    console.log(`✅ 字典构建完成，共找到 ${Object.keys(tagMap).length} 个标签。`);
    return tagMap;
}

async function syncArticles(tagMap) {
    console.log(`\n🚀 正在扫描文章数据库 (ID: ${ARTICLE_DB_ID})...`);
    
    const pages = await notion.databases.query({
        database_id: ARTICLE_DB_ID,
    });

    console.log(`📄 共扫描到 ${pages.results.length} 篇文章`);

    for (const page of pages.results) {
        // 🌟 智能获取文章标题 (修复报错的核心点)
        const titleKey = Object.keys(page.properties).find(k => page.properties[k].type === 'title');
        const pageTitle = titleKey ? page.properties[titleKey].title?.[0]?.plain_text : page.id;
        
        // 1. 检查 Relation 属性
        const relationProp = page.properties[PROPS.RELATION];
        if (!relationProp) {
            console.error(`❌ [${pageTitle}] 报错: 找不到名为 "${PROPS.RELATION}" 的属性。请检查代码里的 PROPS 配置！`);
            continue;
        }

        const relationIds = relationProp.relation.map(r => r.id);
        
        // 2. 匹配标签名
        const targetTags = [];
        for (const id of relationIds) {
            const name = tagMap[id];
            if (name) {
                targetTags.push(name);
            } else {
                // 如果关联了标签但字典里没找到，可能是关联到了其他数据库，或者标签被删了
                // console.warn(`⚠️ [${pageTitle}] 关联了未知标签 ID: ${id} (忽略)`);
            }
        }

        // 3. 检查 tags 属性 (Select 或 Multi-select)
        const selectProp = page.properties[PROPS.SELECT];
        if (!selectProp) {
             console.error(`❌ [${pageTitle}] 报错: 找不到名为 "${PROPS.SELECT}" 的属性。`);
             continue;
        }

        // 获取当前标签
        let currentTags = [];
        if (selectProp.type === 'multi_select') {
            currentTags = selectProp.multi_select.map(opt => opt.name);
        } else if (selectProp.type === 'select') {
            currentTags = selectProp.select ? [selectProp.select.name] : [];
        }

        // 4. 对比与更新
        const targetSorted = [...targetTags].sort().join(",");
        const currentSorted = [...currentTags].sort().join(",");

        if (targetSorted !== currentSorted) {
            console.log(`🔄 [${pageTitle}] 更新标签: [${currentSorted}] -> [${targetSorted}]`);
            
            // 构造更新数据
            const updateBody = {};
            if (selectProp.type === 'multi_select') {
                updateBody[PROPS.SELECT] = {
                    multi_select: targetTags.map(name => ({ name }))
                };
            } else {
                updateBody[PROPS.SELECT] = {
                    select: targetTags.length > 0 ? { name: targetTags[0] } : null
                };
            }

            try {
                await notion.pages.update({
                    page_id: page.id,
                    properties: updateBody
                });
                console.log(`   ✅ 成功`);
            } catch (err) {
                console.error(`   ❌ 更新失败: ${err.message}`);
            }
        } else {
            // console.log(`   💤 [${pageTitle}] 无需更新`);
        }
    }
}

async function main() {
    try {
        const tagMap = await getTagMap();
        await syncArticles(tagMap);
        console.log("\n🎉 所有任务执行完毕！");
    } catch (e) {
        console.error("❌ 发生未捕获的错误:", e);
        process.exit(1); // 让 Action 显示为失败
    }
}

main();
